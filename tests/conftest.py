from pathlib import Path
import pytest
from backend.config import Settings
from backend.store import Store

@pytest.fixture
def store(tmp_path):
    return Store(Settings(tmp_path/'Data',tmp_path/'Logs'))
