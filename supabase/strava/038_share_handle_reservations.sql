-- Clean profile URLs must not shadow STRIVE's own routes. NOT VALID keeps any
-- historical collision readable while enforcing the rule on every new write.
alter table strava.profiles
  add constraint profiles_handle_not_system_route
  check (handle is null or lower(handle) not in
    ('api','capture','about','privacy','terms','feed','people','add','r','l','d',
     'proof','agents','account','connect','favicon','robots','sitemap','login',
     'sign-in','post','projects','project','boards','inbox','following','mine','share'))
  not valid;
