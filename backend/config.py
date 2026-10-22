from dataclasses import dataclass, field
from pathlib import Path
from zoneinfo import ZoneInfo
import json
import re
import uuid
import yaml

ROOT = Path(__file__).resolve().parents[1]

@dataclass(frozen=True)
class Settings:
    data_dir: Path
    logs_dir: Path
    timezone: str = 'Asia/Shanghai'
    host: str = '0.0.0.0'
    port: int = 8088

    pkf_default_prefix: str = 'PKF26GR'
    validation_reminders: dict = field(default_factory=lambda: {'default': [], 'by_model_os': {}})

    @classmethod
    def load(cls, filename: Path = ROOT / 'config.yaml', initialize_empty: bool = False):
        filename = filename.resolve()
        cfg = yaml.safe_load(filename.read_text()) or {}
        storage, server, display = (cfg.get(k, {}) for k in ('storage', 'server', 'display'))
        business_dir = (filename.parent / cfg.get('business', {}).get('config_dir', str(ROOT / 'config'))).resolve()
        prefix, reminders = load_business_config(business_dir)
        data = (filename.parent / storage.get('data_dir', './Data')).resolve()
        logs = (filename.parent / storage.get('logs_dir', './Logs')).resolve()
        if data != (filename.parent / 'Data').resolve() and not (data / 'idrac-list.sqlite3').exists() and not initialize_empty:
            raise ValueError('New data directory has no database; migrate data or use --initialize-empty-data')
        timezone = display.get('timezone', 'Asia/Shanghai')
        ZoneInfo(timezone)
        port = server.get('port', 8088)
        if not isinstance(port, int) or not 1 <= port <= 65535:
            raise ValueError('Invalid server.port')
        for directory in (data, logs):
            directory.mkdir(parents=True, exist_ok=True)
            probe = directory / ('.write-check-'+uuid.uuid4().hex)
            probe.write_text('')
            probe.unlink()
        return cls(data, logs, timezone, server.get('host', '0.0.0.0'), port, prefix, reminders)


def load_business_config(directory: Path):
    """Fail fast on missing/malformed config; never silently ignore a typo."""
    try:
        pkf = json.loads((directory / 'pkf.json').read_text(encoding='utf-8'))
        reminders = json.loads((directory / 'validation_reminders.json').read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        raise ValueError(f'无法读取业务配置 {directory}: {exc}') from exc
    if not isinstance(pkf, dict) or set(pkf) != {'default_prefix'} or not isinstance(pkf['default_prefix'], str) or not re.fullmatch(r'PKF[0-9]{2}GR', pkf['default_prefix']):
        raise ValueError('pkf.json: default_prefix 应为 PKF26GR 或 PKF27GR 形式，不包含编号补零')
    if not isinstance(reminders, dict) or set(reminders) != {'default', 'by_model_os'}:
        raise ValueError('validation_reminders.json 必须包含 default、by_model_os')
    def valid_lines(lines):
        return isinstance(lines, list) and all(isinstance(line, str) for line in lines)
    if not valid_lines(reminders['default']) or not isinstance(reminders['by_model_os'], dict):
        raise ValueError('Validation 提醒必须为字符串数组，by_model_os 必须为对象')
    models = {'R250','R260','R450','R640','R660XS','SE50'}
    systems = {'xDome','CTD','SRA'}
    for model, mapping in reminders['by_model_os'].items():
        if model not in models or not isinstance(mapping, dict):
            raise ValueError(f'Validation 提醒包含无效 Model: {model}')
        for system, lines in mapping.items():
            if system not in systems or not valid_lines(lines):
                raise ValueError(f'Validation 提醒格式无效: {model}/{system}')
    return pkf['default_prefix'], reminders
