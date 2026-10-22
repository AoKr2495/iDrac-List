import argparse
from pathlib import Path
import uvicorn
from .app import create_app
from .config import Settings, ROOT
parser = argparse.ArgumentParser()
parser.add_argument('--config', type=Path, default=ROOT/'config.yaml')
parser.add_argument('--initialize-empty-data', action='store_true')
args = parser.parse_args()
settings = Settings.load(args.config,args.initialize_empty_data)
uvicorn.run(create_app(settings),host=settings.host,port=settings.port,workers=1,timeout_graceful_shutdown=10)
