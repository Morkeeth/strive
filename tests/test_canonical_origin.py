"""Public defaults point to STRIVE; explicit local and preview targets stay usable."""
import importlib
import unittest
from unittest.mock import patch

class CanonicalOrigin(unittest.TestCase):
    def test_default_and_explicit_capture_origins(self):
        for name in ('push','rigcard','sharecard'):
            module=importlib.import_module('agentgrinder.'+name)
            with patch.dict('os.environ',{},clear=True):
                importlib.reload(module)
                self.assertEqual(module.DEFAULT_URL,'https://striverun.app')
            with patch.dict('os.environ',{'AGENTGRINDER_URL':'http://localhost:8000'},clear=True):
                importlib.reload(module)
                self.assertEqual(module.DEFAULT_URL,'http://localhost:8000')
            importlib.reload(module)
    def test_sync_accepts_canonical_but_not_arbitrary_hosts(self):
        from agentgrinder import sync
        self.assertEqual(sync.DEFAULT_SITE,'https://striverun.app')
        self.assertEqual(sync.check_site('https://striverun.app'),'https://striverun.app')
        with self.assertRaises(ValueError):sync.check_site('https://striverun.app.attacker.test')
        with self.assertRaises(ValueError):sync.check_site('http://striverun.app')

if __name__=='__main__':unittest.main()
