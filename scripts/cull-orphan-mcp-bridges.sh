#!/bin/bash
# Cull leftover filesystem obsidian-bridge processes.
#
# A healthy desk is one bridge per live client (Cursor usually one; Codex one
# per open thread). It is not "zero processes".
#
# Default policy:
#   - Match a real argv entry ending in obsidian-bridge/index.js.
#     Clients that merely mention that path (MCP JSON, --mcp-config) are not bridges.
#   - Keep the newest bridge of each living parent, however old it is.
#   - Remove older siblings, and bridges reparented to pid 1, only after
#     OBSIDIAN_BRIDGE_CULL_MIN_AGE_SEC (default 3600). An hourly launchd job
#     uses that floor so a thread that just started is left alone.
#   - OBSIDIAN_BRIDGE_CULL_KEEP_NEWEST=0 culls every match past the age floor,
#     including the live one. Leave it at 1.
#   - OBSIDIAN_BRIDGE_CULL_PATTERN overrides the filename suffix.
#   - OBSIDIAN_BRIDGE_CULL_DRY_RUN=1 prints decisions and does not signal.
#
# Bash 3.2 compatible (macOS /bin/bash). No associative arrays.
set -euo pipefail

PATTERN="${OBSIDIAN_BRIDGE_CULL_PATTERN:-obsidian-bridge/index.js}"
MIN_AGE="${OBSIDIAN_BRIDGE_CULL_MIN_AGE_SEC:-3600}"
KEEP_NEWEST="${OBSIDIAN_BRIDGE_CULL_KEEP_NEWEST:-1}"
DRY_RUN="${OBSIDIAN_BRIDGE_CULL_DRY_RUN:-0}"

etime_to_seconds() {
  local etime="$1" days=0 a b c h=0 m=0 s=0
  etime="${etime// /}"
  if [[ "$etime" == *-* ]]; then
    days="${etime%%-*}"
    etime="${etime#*-}"
  fi
  IFS=: read -r a b c <<<"$etime"
  if [[ -z "${b:-}" ]]; then
    s="${a:-0}"
  elif [[ -z "${c:-}" ]]; then
    m="$a"
    s="$b"
  else
    h="$a"
    m="$b"
    s="$c"
  fi
  echo $(( ${days:-0} * 86400 + 10#${h:-0} * 3600 + 10#${m:-0} * 60 + 10#${s:-0} ))
}

is_bridge_command() {
  local cmd="$1" token noglob=0
  case "$cmd" in
    *mcpServers*|*--mcp-config*) return 1 ;;
  esac
  case $- in *f*) noglob=1 ;; esac
  set -f
  for token in $cmd; do
    token="${token%\"}"
    token="${token#\"}"
    token="${token%\'}"
    token="${token#\'}"
    case "$token" in
      *[{}\[\],:]*) continue ;;
    esac
    case "$token" in
      "$PATTERN"|*/"$PATTERN")
        [[ "$noglob" == 0 ]] && set +f
        return 0
        ;;
    esac
  done
  [[ "$noglob" == 0 ]] && set +f
  return 1
}

# stdin rows: pid<TAB>ppid<TAB>age_seconds<TAB>command
# stdout: one pid per line to signal
decide_cull_rows() {
  local min_age="$1" keep_newest="$2"
  local line pid ppid age cmd parent seen newest_i j i
  local -a pids=() ppids=() ages=()
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" ]] && continue
    pid="${line%%$'\t'*}"
    line="${line#*$'\t'}"
    ppid="${line%%$'\t'*}"
    line="${line#*$'\t'}"
    age="${line%%$'\t'*}"
    cmd="${line#*$'\t'}"
    is_bridge_command "$cmd" || continue
    [[ "$pid" == "$$" || "$pid" == "${PPID:-}" ]] && continue
    pids+=("$pid")
    ppids+=("$ppid")
    ages+=("$age")
  done

  [[ "${#pids[@]}" -eq 0 ]] && return 0
  seen="|"
  for i in "${!pids[@]}"; do
    parent="${ppids[$i]}"
    case "$seen" in
      *"|$parent|"*) continue ;;
    esac
    seen="${seen}${parent}|"
    if [[ "$parent" == "0" || "$parent" == "1" ]]; then
      for j in "${!pids[@]}"; do
        [[ "${ppids[$j]}" == "$parent" ]] || continue
        if [[ "${ages[$j]}" -ge "$min_age" ]]; then
          printf '%s\n' "${pids[$j]}"
        fi
      done
      continue
    fi
    newest_i=""
    for j in "${!pids[@]}"; do
      [[ "${ppids[$j]}" == "$parent" ]] || continue
      if [[ -z "$newest_i" ]]; then
        newest_i="$j"
        continue
      fi
      if [[ "${ages[$j]}" -lt "${ages[$newest_i]}" ]] || {
        [[ "${ages[$j]}" -eq "${ages[$newest_i]}" ]] && [[ "${pids[$j]}" -gt "${pids[$newest_i]}" ]]
      }; then
        newest_i="$j"
      fi
    done
    for j in "${!pids[@]}"; do
      [[ "${ppids[$j]}" == "$parent" ]] || continue
      if [[ "$keep_newest" == "1" && "$j" == "$newest_i" ]]; then
        continue
      fi
      if [[ "${ages[$j]}" -ge "$min_age" ]]; then
        printf '%s\n' "${pids[$j]}"
      fi
    done
  done
}

process_command() {
  local pid="$1"
  if [[ -r "/proc/$pid/cmdline" ]]; then
    tr '\0' ' ' <"/proc/$pid/cmdline"
    return
  fi
  ps -p "$pid" -o args= 2>/dev/null || true
}

list_process_rows() {
  ps axww -o pid=,ppid=,etime=,args= | awk '
    NF >= 4 {
      pid = $1
      ppid = $2
      etime = $3
      cmd = $4
      for (i = 5; i <= NF; i++) cmd = cmd " " $i
      printf "%s\t%s\t%s\t%s\n", pid, ppid, etime, cmd
    }
  '
}

in_list() {
  local needle="$1" item
  shift
  for item in "$@"; do
    [[ "$item" == "$needle" ]] && return 0
  done
  return 1
}

cull_main() {
  local rows="" line pid ppid etime cmd age translated="" matched=0 kept=0 culled=0 young=0
  local -a cull_pids=()
  rows="$(list_process_rows)"
  while IFS= read -r line || [[ -n "${line:-}" ]]; do
    [[ -z "${line:-}" ]] && continue
    pid="${line%%$'\t'*}"
    line="${line#*$'\t'}"
    ppid="${line%%$'\t'*}"
    line="${line#*$'\t'}"
    etime="${line%%$'\t'*}"
    cmd="${line#*$'\t'}"
    age="$(etime_to_seconds "$etime")"
    translated+="${pid}"$'\t'"${ppid}"$'\t'"${age}"$'\t'"${cmd}"$'\n'
  done <<<"$rows"

  local decided=""
  decided="$(printf '%s' "$translated" | decide_cull_rows "$MIN_AGE" "$KEEP_NEWEST" || true)"
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    cull_pids+=("$pid")
  done <<<"$decided"

  while IFS= read -r line || [[ -n "${line:-}" ]]; do
    [[ -z "${line:-}" ]] && continue
    pid="${line%%$'\t'*}"
    line="${line#*$'\t'}"
    ppid="${line%%$'\t'*}"
    line="${line#*$'\t'}"
    age="${line%%$'\t'*}"
    cmd="${line#*$'\t'}"
    is_bridge_command "$cmd" || continue
    matched=$((matched + 1))
    if [[ "${#cull_pids[@]}" -gt 0 ]] && in_list "$pid" "${cull_pids[@]}"; then
      :
    else
      kept=$((kept + 1))
      if [[ "$age" -lt "$MIN_AGE" ]]; then
        young=$((young + 1))
      fi
    fi
  done <<<"$translated"

  local target current
  if [[ "${#cull_pids[@]}" -gt 0 ]]; then
    for target in "${cull_pids[@]}"; do
      current="$(process_command "$target" || true)"
      if ! is_bridge_command "$current"; then
        continue
      fi
      if [[ "$DRY_RUN" == "1" ]]; then
        echo "dry-run cull $target"
        culled=$((culled + 1))
        continue
      fi
      if kill "$target" 2>/dev/null; then
        culled=$((culled + 1))
      fi
    done
  fi

  echo "cull-orphan-mcp-bridges: matched=$matched kept=$kept culled=$culled young_kept=$young min_age_sec=$MIN_AGE"
  echo "one bridge per live client is expected; Codex may still show a young extra per thread until it passes the age floor"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  cull_main "$@"
fi
