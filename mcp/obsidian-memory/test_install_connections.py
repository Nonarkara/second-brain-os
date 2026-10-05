import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import install_connections  # noqa: E402


class InstallConnectionTests(unittest.TestCase):
    def setUp(self):
        self.previous = os.environ.get("OBSIDIAN_NODE")
        os.environ["OBSIDIAN_NODE"] = "/usr/bin/node"

    def tearDown(self):
        if self.previous is None:
            os.environ.pop("OBSIDIAN_NODE", None)
        else:
            os.environ["OBSIDIAN_NODE"] = self.previous

    def test_bridge_is_the_shipped_mcp_layout(self):
        bridge = install_connections.bridge_index()
        self.assertTrue(bridge.is_file())
        self.assertEqual(bridge.parent.name, "obsidian-bridge")
        self.assertNotIn(".mcp", bridge.parts)
        brain = install_connections.brain_py()
        self.assertEqual(brain.name, "brain.py")
        self.assertTrue(brain.is_file())

    def test_clients_point_at_repo_bridge_and_vault_env(self):
        vault = Path("/tmp/example-vault")
        home = Path("/tmp/example-home")
        _path, _section, _name, expected = install_connections.expected_servers(vault, home)["cursor"]
        self.assertEqual(expected["command"], "/usr/bin/node")
        self.assertEqual(expected["args"], [str(install_connections.bridge_index())])
        self.assertEqual(expected["env"]["OBSIDIAN_VAULT"], str(vault))
        self.assertNotIn(".mcp/obsidian-bridge", expected["args"][0])

    def test_codex_block_has_timeouts_and_zone(self):
        text = install_connections.codex_block(Path("/tmp/example-vault"))
        self.assertIn('command = "/usr/bin/node"', text)
        self.assertIn("startup_timeout_sec = 10", text)
        self.assertIn("tool_timeout_sec = 60", text)
        self.assertIn('OBSIDIAN_TIME_ZONE = "Asia/Bangkok"', text)
        self.assertIn("obsidian-bridge/index.js", text)
        self.assertNotIn(".mcp/obsidian-bridge", text)
        self.assertIn('OBSIDIAN_VAULT = "/tmp/example-vault"', text)

    def test_brain_wrapper_uses_the_sibling_cli(self):
        wrapper = install_connections.brain_wrapper(Path("/tmp/example-vault"))
        self.assertIn("python3", wrapper)
        self.assertIn(str(install_connections.brain_py()), wrapper)
        self.assertNotIn(".mcp/obsidian-memory", wrapper)
        self.assertIn("/tmp/example-vault", wrapper)


if __name__ == "__main__":
    unittest.main()
