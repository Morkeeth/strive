import json, tempfile, unittest
from pathlib import Path
from agentgrinder.session_picker import discover, page
from agentgrinder.stream_capture import inspect_source

class ImportLoaderTests(unittest.TestCase):
    def test_cursor_local_context(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'projects'/'Users-test-CODE-moon-demo'/'agent-transcripts'/'session.jsonl'
            source.parent.mkdir(parents=True)
            source.write_text(json.dumps({'role':'user','message':{'content':[{'type':'text','text':'<timestamp>Monday, Oct 12, 2026, 3:09 PM (UTC+2)</timestamp> <user_query>Make a moon calendar</user_query>'}]}})+'\n')
            row=discover('cursor',candidates=[('cursor',source)])[0]
            self.assertEqual(row['project'],'CODE-moon-demo')
            self.assertEqual(row['prompt'],'Make a moon calendar')
            self.assertEqual(row['time_basis'],'recorded')
            self.assertTrue(row['started'].startswith('2026-10-12T13:09:00'))
    def test_relative_time_is_based_on_recorded_clock(self):
        from agentgrinder.session_picker import relative_time
        from datetime import datetime,timezone
        now=datetime(2026,10,12,15,9,tzinfo=timezone.utc)
        self.assertEqual(relative_time('2026-10-12T13:09:00Z',now),'2 hours ago')
        self.assertEqual(relative_time('missing',now),'Time not recorded')

    def test_real_record_count_progress(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'session.jsonl'
            source.write_text('\n'.join(json.dumps({'role':'user' if i==0 else 'assistant','message':{'content':'<user_query>Make a moon calendar</user_query>' if i==0 else 'Done'}}) for i in range(520)))
            events=[]
            info=inspect_source(source,'cursor',progress=lambda *event:events.append(event))
            self.assertEqual(info['sittings'][0]['records'],520)
            self.assertIn(('reading',256,'records read'),events)
            self.assertIn(('reading',520,'records read'),events)
    def test_no_script_loader(self):
        html=page('<div class="loader"><span class="spinner"></span></div>')
        self.assertIn('@media(prefers-reduced-motion:reduce)',html)
        self.assertNotIn('<script',html)

class CursorStoreQueryTests(unittest.TestCase):
    def test_bubble_reader_uses_composer_index_range(self):
        import sqlite3
        from agentgrinder.cursor_tree import _bubble_stats
        db=sqlite3.connect(':memory:')
        db.execute('create table cursorDiskKV(key text primary key,value text)')
        db.executemany('insert into cursorDiskKV values(?,?)',[('bubbleId:demo:1','{}'),('bubbleId:other:1','{}')])
        statements=[];db.set_trace_callback(statements.append)
        _bubble_stats(db,'demo');db.set_trace_callback(None)
        statement=next(s for s in statements if 'select value' in s.lower())
        plan=db.execute('explain query plan '+statement).fetchall()
        self.assertTrue(any('SEARCH' in row[-1] for row in plan),plan)
        self.assertEqual(_bubble_stats(db,'demo')['bubbles'],1)
        from agentgrinder.cursor_tree import _bubble_activity
        db.execute('delete from cursorDiskKV')
        db.executemany('insert into cursorDiskKV values(?,?)',[
            ('bubbleId:demo:z',json.dumps({'createdAt':'2026-10-12T13:01:00Z','toolFormerData':{'name':'test'}})),
            ('bubbleId:other:a',json.dumps({'createdAt':'2026-10-12T10:00:00Z','toolFormerData':{'name':'test'}})),
            ('bubbleId:demo:a',json.dumps({'createdAt':'2026-10-12T13:00:00Z','toolFormerData':{'name':'test'}}))])
        tools,_,_=_bubble_activity(db,'demo')
        self.assertEqual(tools,['2026-10-12T13:01:00Z','2026-10-12T13:00:00Z'])
        db.close()
