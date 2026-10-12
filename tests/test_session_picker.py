"""Local picker privacy and real capture pipeline; no production connection."""
import base64, gzip, re, html, json, tempfile, threading, unittest, urllib.request, urllib.error
from pathlib import Path
from urllib.parse import urlencode, urlparse
from agentgrinder.session_picker import discover, make_server

class PickerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.source=self.root/'session.jsonl'
        self.rows=[{'type':'session_meta','timestamp':'2026-10-11T07:00:00Z','payload':{'id':'test-native-session','cwd':str(self.root/'My project'),'source':'exec'}},
                   {'type':'response_item','timestamp':'2026-10-11T07:00:01Z','payload':{'type':'message','role':'user','content':[{'type':'input_text','text':'PRIVATE FIRST PROMPT <script>alert(1)</script>'}]}},
                   {'type':'event_msg','timestamp':'2026-10-11T07:00:05Z','payload':{'type':'user_message','message':'PRIVATE FIRST PROMPT <script>alert(1)</script>'}},
                   {'type':'response_item','timestamp':'2026-10-11T07:00:10Z','payload':{'type':'function_call','name':'exec_command','arguments':'{"cmd":"pwd"}'}}]
        self.source.write_text('\n'.join(map(json.dumps,self.rows)))
    def tearDown(self):self.tmp.cleanup()
    def assert_private_handoff(self, payload):
        def check(value, trail=()):
            if isinstance(value, dict):
                for key, child in value.items():
                    self.assertNotIn(key.lower(), ('prompt', 'path', 'cwd'), trail)
                    if key.lower() == 'source':
                        self.assertEqual(trail, ('capture_metadata', 'estimates'))
                        self.assertEqual(set(child), {'sha256', 'started_at', 'ended_at'})
                    check(child, trail+(key,))
            elif isinstance(value, list):
                for child in value: check(child, trail)
            elif isinstance(value, str):
                self.assertNotRegex(value, r'(?:/Users/|/home/|~/|[A-Za-z]:[\\/]Users[\\/])')
                self.assertNotIn(str(self.root), value)
                self.assertNotIn('PRIVATE FIRST PROMPT', value)
        check(payload)

    def test_discovery_and_child_exclusion(self):
        rows=discover('codex',candidates=[('codex',self.source)])
        self.assertEqual(rows[0]['project'],'My project');self.assertIn('PRIVATE FIRST PROMPT',rows[0]['prompt'])
        self.rows[0]['payload']['source']={'subagent':{'thread_spawn':{}}};self.source.write_text('\n'.join(map(json.dumps,self.rows)))
        self.assertEqual(discover('codex',candidates=[('codex',self.source)]),[])
    def test_picker_selects_one_and_keeps_prompt_local(self):
        server,url=make_server('codex',self.root/'state','https://striverun.app',[('codex',self.source)])
        self.assertEqual(server.socket.getsockname()[0], '127.0.0.1', 'Inspect actual listening socket, not returned URL')
        self.assertEqual(urlparse(url).hostname, '127.0.0.1')
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            hostile=urllib.request.Request(url,headers={'Host':'evil.example'})
            with self.assertRaises(urllib.error.HTTPError) as caught:urllib.request.urlopen(hostile)
            self.assertEqual(caught.exception.code,404)
            body=urllib.request.urlopen(url).read().decode()
            self.assertIn('&lt;script&gt;',body);self.assertNotIn('<script>alert',body)
            self.assertIn('If a session is still running',body)
            token=url.rsplit('/',1)[1];data=urlencode({'session':'0','project':'My project','token':token,'phase':'sittings'}).encode()
            for origin in ('https://evil.example','null'):
                req=urllib.request.Request(url,data=data,headers={'Origin':origin})
                with self.assertRaises(urllib.error.HTTPError) as caught:urllib.request.urlopen(req)
                self.assertEqual(caught.exception.code,403)
            self.assertFalse((self.root/'state'/'plugin.db').exists(),'GET and rejected requests create no capture')
            req=urllib.request.Request(url,data=data,headers={'Origin':url.rsplit('/',1)[0]})
            self.assertIn('Choose the part you worked on',urllib.request.urlopen(req).read().decode())
            data=urlencode({'session':'0','project':'My project','token':token,'sitting':'1'}).encode()
            req=urllib.request.Request(url,data=data,headers={'Origin':url.rsplit('/',1)[0]})
            result=urllib.request.urlopen(req).read().decode();self.assertIn('Open private preview',result)
            self.assertIn('Captured through',result)
            self.assertIn('Later work in a live session is not part of this preview',result)
            self.assertIn('No run is saved online yet',result)
            self.assertNotIn('PRIVATE FIRST PROMPT',result)
            import sqlite3
            db=sqlite3.connect(self.root/'state'/'plugin.db')
            self.assertEqual(db.execute('select count(*) from drafts').fetchone()[0],1)
            payload=db.execute('select payload from drafts').fetchone()[0]
            self.assertNotIn('PRIVATE FIRST PROMPT',payload);self.assertEqual(json.loads(payload)['visibility'],'private')
            href=html.unescape(re.search(r'href="([^"]+/#import=gz\.[^"]+)"',result)[1])
            packed=href.split('#import=gz.')[1]
            imported=json.loads(gzip.decompress(base64.urlsafe_b64decode(packed+'='*(-len(packed)%4))))
            self.assertEqual(imported,json.loads(payload),'Single-run preview must preserve the canonical capture byte-for-byte in meaning')
            self.assertTrue(imported['measurement_revision'])
            self.assert_private_handoff(imported)
            self.assertEqual(db.execute('select count(*) from saves').fetchone()[0],0);db.close()
        finally:server.shutdown();server.server_close();thread.join()

    def test_slow_capture_survives_a_closed_browser_and_a_second_press(self):
        # Reported 12 Oct: a long capture finished after the browser had gone; the ready page hit a dead socket.
        import socket, time
        from agentgrinder import plugin
        real=plugin.capture;calls=[]
        def slow(*a,**k):calls.append(1);time.sleep(4);return real(*a,**k)
        server,url=make_server('codex',self.root/'state','https://striverun.app',[('codex',self.source)])
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        plugin.capture=slow
        try:
            token=url.rsplit('/',1)[1];origin=url.rsplit('/',1)[0];port=int(origin.rsplit(':',1)[1])
            data=urlencode({'session':'0','project':'My project','token':token,'sitting':'1'}).encode()
            raw=socket.create_connection(('127.0.0.1',port))
            raw.sendall(('POST /'+token+' HTTP/1.1\r\nHost: 127.0.0.1:'+str(port)+'\r\nOrigin: '+origin+'\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: '+str(len(data))+'\r\n\r\n').encode()+data)
            time.sleep(0.3);raw.close()
            req=urllib.request.Request(url,data=data,headers={'Origin':origin})
            response=urllib.request.urlopen(req);self.assertEqual(response.status,202)
            waiting=response.read().decode();self.assertIn('Preparing your private preview',waiting)
            route=waiting.split('url=',1)[1].split('"',1)[0];self.assertTrue(route.startswith('/'+token+'/job/'))
            deadline=time.time()+20
            while time.time()<deadline:
                page=urllib.request.urlopen(origin+route).read().decode()
                if 'Open private preview' in page:break
                time.sleep(0.5)
            self.assertIn('Open private preview',page);self.assertNotIn('PRIVATE FIRST PROMPT',page)
            self.assertEqual(len(calls),1,'a second press reuses the running capture')
            again=urllib.request.urlopen(urllib.request.Request(url,data=data,headers={'Origin':origin}))
            self.assertEqual(again.status,200);self.assertIn('Open private preview',again.read().decode());self.assertEqual(len(calls),1)
        finally:plugin.capture=real;server.shutdown();server.server_close()

    def test_loader_reports_real_progress_under_no_script_csp(self):
        from agentgrinder import plugin
        from unittest.mock import patch
        release=threading.Event();seen=threading.Event();real=plugin.capture
        def controlled(*args,**kwargs):
            report=kwargs['progress']
            def progress(stage,count=None,unit=None):
                report(stage,count,unit)
                if stage=='reading' and count is not None:
                    seen.set();release.wait(10)
            kwargs['progress']=progress
            return real(*args,**kwargs)
        server,url=make_server('codex',self.root/'state','https://striverun.app',[('codex',self.source)])
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with patch.object(plugin,'capture',controlled):
                token=url.rsplit('/',1)[1];origin=url.rsplit('/',1)[0]
                data=urlencode({'session':'0','project':'My project','token':token,'sitting':'1'}).encode()
                response=urllib.request.urlopen(urllib.request.Request(url,data=data,headers={'Origin':origin}))
                self.assertTrue(seen.is_set());self.assertEqual(response.status,202)
                body=response.read().decode()
                self.assertIn("default-src 'none'",response.headers['Content-Security-Policy'])
                self.assertNotIn('script-src',response.headers['Content-Security-Policy'])
                self.assertNotIn('<script',body)
                for label in ('Finding the session','Reading turns','Counting tools','Building the preview','records read','seconds elapsed'):self.assertIn(label,body)
                self.assertIn('Reading turns · In progress',body)
                route=body.split('url=',1)[1].split('"',1)[0]
                release.set()
                import time
                deadline=time.time()+10
                while time.time()<deadline:
                    finished=urllib.request.urlopen(origin+route).read().decode()
                    if 'Open private preview' in finished:break
                    time.sleep(.1)
                self.assertIn('Open private preview',finished)
        finally:release.set();server.shutdown();server.server_close();thread.join()

    def test_picker_names_existing_folder_instead_of_opaque_capture_error(self):
        server,url=make_server('codex',self.root/'state','https://striverun.app',[('codex',self.source)])
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            token=url.rsplit('/',1)[1];origin=url.rsplit('/',1)[0]
            def submit(name):
                data=urlencode({'session':'0','project':name,'token':token}).encode()
                return urllib.request.urlopen(urllib.request.Request(url,data=data,headers={'Origin':origin}))
            self.assertIn('Open private preview',submit('Night run').read().decode())
            with self.assertRaises(urllib.error.HTTPError) as caught: submit('Other name')
            self.assertEqual(caught.exception.code,400)
            body=caught.exception.read().decode()
            self.assertIn('already registered as Night run',body)
            self.assertIn('Continue with this name for the same session and sitting',body)
            self.assertIn('<button>Continue as Night run</button>',body)
            self.assertIn('name="project" value="Night run"',body)
            self.assertIn('Nothing was uploaded',body)
            fields=dict((key,html.unescape(value)) for key,value in re.findall(r'name="([^" ]+)" value="([^"]*)"',body))
            continued=urllib.request.urlopen(urllib.request.Request(url,data=urlencode(fields).encode(),headers={'Origin':origin})).read().decode()
            self.assertIn('Open private preview',continued)
            self.assertIn('Open private preview',submit('Night run').read().decode())
        finally:server.shutdown();server.server_close();thread.join()

    def test_local_mcp_has_no_outward_tools_and_shares_capture(self):
        from unittest.mock import patch
        from agentgrinder import mcp_server as mcp
        tools=mcp.capture_handle({'id':1,'method':'tools/list'})['result']['tools']
        self.assertEqual([t['name'] for t in tools],['list_sessions','preview_session'])
        rows=discover('codex',candidates=[('codex',self.source)])
        with patch('agentgrinder.session_picker.discover',return_value=rows):listed=mcp.capture_tool('list_sessions',{})
        self.assertNotIn('PRIVATE FIRST PROMPT',json.dumps(listed));self.assertNotIn(str(self.root),json.dumps(listed))
        choice=listed['sessions'][0]['session']
        sittings=mcp.capture_tool('preview_session',{'session':choice})
        self.assertEqual(len(sittings['sittings']),1)
        preview=mcp.capture_tool('preview_session',{'session':choice,'sitting':1,'project':'My project'},self.root/'mcp')
        self.assertEqual(preview['uploaded'],0);self.assertIn('#import=gz.',preview['preview_url'])
        packed=preview['preview_url'].split('#import=gz.')[1]
        self.assert_private_handoff(json.loads(gzip.decompress(base64.urlsafe_b64decode(packed+'='*(-len(packed)%4)))))
        denied=mcp.capture_handle({'id':2,'method':'tools/call','params':{'name':'agent_action','arguments':{'action':'publish'}}})
        self.assertTrue(denied['result']['isError'])


    def test_cursor_truncated_wrappers_are_not_prompt_text(self):
        from agentgrinder.session_picker import clean_prompt
        self.assertEqual(clean_prompt('<user_query>Build the garden', 'cursor'), 'Build the garden')
        self.assertEqual(clean_prompt('<timestamp>2026-10-12T13:50:00Z', 'cursor'), '')
        self.assertEqual(clean_prompt('<timestamp>2026-10-12T13:50:00Z<user_query>Build the garden', 'cursor'), 'Build the garden')
        self.assertEqual(clean_prompt('<timestamp>2026-10-12T13:50:00Z</timestamp><user_query>Build the garden', 'cursor'), 'Build the garden')
        self.assertEqual(clean_prompt('<user_query>Keep <timestamp> in the code</user_query>', 'cursor'), 'Keep <timestamp> in the code')
        self.assertEqual(clean_prompt('<user_query>Keep this literal', 'claude'), '<user_query>Keep this literal')

    def test_cursor_sitting_page_cleans_the_actual_truncated_excerpt(self):
        query='Build the garden with escaped <script> text and real flowers. '*8
        self.source.write_text(json.dumps({'role':'user','message':{'content':'<timestamp>2026-10-12T13:50:00Z</timestamp><user_query>'+query+'</user_query>'}})+'\n')
        server,url=make_server('cursor',self.root/'state','https://striverun.app',[('cursor',self.source)])
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            token=url.rsplit('/',1)[1]
            data=urlencode({'session':'0','project':'Garden','token':token,'phase':'sittings'}).encode()
            request=urllib.request.Request(url,data=data,headers={'Origin':url.rsplit('/',1)[0]})
            page=urllib.request.urlopen(request).read().decode()
            self.assertIn('Choose the part you worked on',page)
            self.assertIn('Build the garden',page)
            self.assertNotIn('&lt;user_query&gt;',page)
            self.assertNotIn('&lt;timestamp&gt;',page)
            self.assertIn('&lt;script&gt;',page)
            self.assertNotIn('<script>',page)
        finally:server.shutdown();server.server_close();thread.join()

if __name__=='__main__':unittest.main()
