import unittest
from pathlib import Path
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
import yaml
from jinja2.nativetypes import NativeEnvironment

CONFIG = yaml.safe_load((Path(__file__).parents[1] / 'examples/last-clean-recorder.yaml').read_text())['template'][0]
TEMPLATE = CONFIG['actions'][0]['variables']['record']

class RecorderTest(unittest.TestCase):
    def setUp(self):
        self.time = datetime(2026, 10, 3, 14, tzinfo=timezone.utc)
        self.entities = {CONFIG['variables'][key]: value for key, value in {
            'vacuum_entity': 'cleaning', 'mode_entity': 'vacuum_then_mop', 'battery_entity': '100',
            'duration_entity': '2940', 'count_entity': '11', 'flag_entity': 'none'
        }.items()}
        self.record = {}
    def step(self, seconds=0, **changes):
        self.time += timedelta(seconds=seconds)
        for key, value in changes.items(): self.entities[CONFIG['variables'][key + '_entity']] = str(value)
        env = NativeEnvironment()
        def timestamp(value, default=None):
            try: return datetime.fromisoformat(value).timestamp() if isinstance(value, str) else value.timestamp()
            except (TypeError, ValueError, AttributeError): return default
        owner = self
        class States:
            def __call__(self, entity): return owner.entities.get(entity, "unknown")
            def __getitem__(self, entity): return SimpleNamespace(attributes=owner.record)
        self.record = env.from_string(TEMPLATE).render(
            **CONFIG['variables'],
            states=States(), now=lambda: self.time,
            as_timestamp=timestamp
        )
        self.assertIsInstance(self.record, dict)
        return self.record
    def test_records_start_snapshots(self):
        r = self.step()
        self.assertEqual(r['pending'].get('started_at'), self.time.isoformat())
        self.assertEqual(r['pending']['mode'], 'vacuum_then_mop')
        self.assertEqual(r['pending']['battery_start'], 100)
        self.assertIsNone(r['finished_at'])

    def test_completed_run_keeps_end_snapshot_before_recharging(self):
        self.step()
        self.step(seconds=2940, vacuum='docked', count=12, duration=2940, battery=52)
        r = self.step(seconds=15, battery=53, mode='mop')
        self.assertEqual(r['finished_at'], '2026-10-03T14:49:00+00:00')
        self.assertEqual(r['started_at'], '2026-10-03T14:00:00+00:00')
        self.assertEqual(r['mode'], 'vacuum_then_mop')
        self.assertEqual(r['duration'], 2940)
        self.assertEqual(r['battery_start'], 100)
        self.assertEqual(r['battery_end'], 52)
        self.assertEqual(r['pending'], {})

    def test_cancelled_return_does_not_publish_or_contaminate_next_run(self):
        self.step()
        self.step(seconds=300, vacuum='docked', battery=90)
        r = self.step(seconds=90)
        self.assertIsNone(r['finished_at'])
        self.assertEqual(r['pending'], {})
        r = self.step(seconds=600, vacuum='cleaning', mode='mop', battery=100)
        self.assertEqual(r['pending']['started_at'], self.time.isoformat())
        self.assertEqual(r['pending']['mode'], 'mop')

    def test_resumable_dock_visits_and_pauses_preserve_one_run(self):
        first = self.step()['pending']['started_at']
        self.step(seconds=300, vacuum='paused', flag='resumable', battery=90)
        self.step(seconds=120, vacuum='cleaning', flag='segment')
        self.step(seconds=900, vacuum='docked', flag='resumable', count=12, battery=30)
        r = self.step(seconds=1800, battery=80)
        self.assertIsNone(r['finished_at'])
        self.assertEqual(r['pending']['started_at'], first)
        self.step(seconds=60, vacuum='cleaning', flag='none', mode='mop')
        self.step(seconds=600, vacuum='docked', flag='none', count=13, duration=1800, battery=50)
        r = self.step(seconds=15)
        self.assertEqual(r['started_at'], first)
        self.assertEqual(r['mode'], 'vacuum_then_mop')
        self.assertEqual(r['battery_start'], 100)
        self.assertEqual(r['battery_end'], 50)

    def test_publication_order_can_correct_a_temporary_terminal_state(self):
        self.step()
        self.step(seconds=300, vacuum='docked', count=12)
        r = self.step(seconds=3, flag='resumable')
        self.assertIsNone(r['finished_at'])
        self.assertEqual(r['pending']['end'], {})
        r = self.step(seconds=1800)
        self.assertIsNone(r['finished_at'])

    def test_delayed_count_preserves_the_docking_battery_snapshot(self):
        self.step()
        self.step(seconds=600, vacuum='docked', duration=600, battery=80)
        r = self.step(seconds=30, count=12, battery=81)
        self.assertEqual(r['battery_end'], 80)
        self.assertEqual(r['finished_at'], '2026-10-03T14:10:00+00:00')

    def test_restored_pending_record_survives_a_restart(self):
        import copy
        self.step()
        saved = copy.deepcopy(self.record)
        self.record = saved
        self.step(seconds=300, vacuum='docked', count=12, duration=300, battery=95)
        r = self.step(seconds=15)
        self.assertEqual(r['started_at'], '2026-10-03T14:00:00+00:00')
        self.assertEqual(r['battery_start'], 100)

    def test_idle_startup_and_unavailable_values_do_not_invent_a_clean(self):
        r = self.step(vacuum='docked')
        self.assertIsNone(r['finished_at'])
        self.assertEqual(r['pending'], {})
        r = self.step(vacuum='cleaning', count='unavailable')
        self.assertEqual(r['pending'], {})

if __name__ == '__main__': unittest.main()
