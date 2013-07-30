/**

YO YO !!!
 * Load markdownblog framework for data handling
 * Load config JSON file
 **/
var mdb = require('node-mongomd-blog');
var config = JSON.parse(require('fs').readFileSync(__dirname + '/config.json','utf8'));

/**
 * Set default category and set default URL
 **/
mdb.setDefault('category', 'General');
mdb.setDefault('url', 'http://' + config.host + (config.port == '80' ? '' : ':' + config.port));

/**
 * Set basic variables passed to jade template
 **/
 
mdb.setMeta('site', config.host); 
mdb.setMeta('url', 'http://' + config.host);
mdb.setMeta('author', config.author);
mdb.setMeta('disqus', config.disqus);

// add admin login
mdb.addLogin(config.admin);

// set mongo db connection info
mdb.setMongoConnectionString(config.mongoConnectionString);

/**
 * Start express.js http servr with kickstart (more: http://semu.mp/node-kickstart.html)
 **/
var kickstart = require('kickstart').withConfig({'name': config.host, 'port': config.port, 'path': __dirname});
var srv = kickstart.srv();

/**
 * Set error handling
 **/
srv.error(function(err, req, res, next){
  if (err instanceof NotFound) {
    mdb.setMeta('url', mdb.getDefault('url') + req.url);
    mdb.setMeta('title', '404 Not Found');
      
    res.statusCode = 404;
    res.render('errors/404', mdb.jadeData({url: req.url}, req)); } 
  else {
    next(err); }
});

/**
 * Check session data
 **/
srv.all('*', function(req, res, next) {
  if (req.session && req.session.valid) {
    req.isAdmin = true; } else { req.isAdmin = false; }
  next();
});

/**
 * Callback for creating new articles
 **/
srv.all('/api/new', function(req, res) {
  var newName = null;
  if (req.session && req.body.name && (newName = mdb.createNewArticle(req.body.name)) != null) {
    return res.end(newName); } 
  else {
    return res.end('0'); }
});

/**
 * Callback for creating new articles
 **/
srv.all('/api/drafts', function(req, res) {
  var newName = null;
  if (req.session) {
    return res.end(JSON.stringify(mdb.getDrafts())); } 
  else {
    return res.end('0'); }
});

/**
 * Callback for authenticating user session
 **/
srv.post('/api/auth', function(req, res) {
  mdb.checkLogin(req.body.name, req.body.password, function(err) {
    if (err) {
      if (req.session) {
      	req.isAdmin = false;
        delete req.session; }
      res.end('0'); }
    else {
      req.session.valid = true;
      res.end('1'); }
  });
});

/**
 * Display all posts available
 * @example http://semu.mp/posts
 **/
srv.all('/posts/:pageNumber?', function(req, res) {
  var pageNumber = req.params.pageNumber || 0;
  mdb.setMeta('url', mdb.getDefault('url') + req.url);
  mdb.setMeta('title', 'Articles');
  mdb.setMeta('headline', 'Recent Articles');
  mdb.setMeta('current', 'posts');  

  mdb.getArticles(pageNumber, function(articles) {
    res.render('posts', mdb.jadeData({list: articles}, req));
  });
});

/**
 * Display single blog post
 * @example http://semu.mp/hello-world
 **/
srv.all('/:articleSlug', function(req, res) {
  var articleSlug = req.params.articleSlug;
  console.log(req.method, 'article', articleSlug);
  var updateData = req.param('data', null);
  var hasSession = req.session.valid;
  if (updateData && hasSession) {
    mdb.updateArticle(articleSlug, updateData); }
  
  mdb.getArticle(articleSlug, function(item) {
  	if (!item) {
      res.statusCode = 404;
      res.render('errors/404', mdb.jadeData({url: req.url}, req)); 
      return;
    } 
	  // if (item.url != mdb.getDefault('url') + req.url) {
	  //   return res.redirect(item.url, 301); }
	    
		mdb.setMeta('url', item.url);
		mdb.setMeta('title', item.name);
		mdb.setMeta('headline', item.name);	
		mdb.setMeta('current', 'posts');
		
	  res.render('article', mdb.jadeData({article: item, auth: req.session.valid}, req));
  });
});

/** todo
 * Display articles by tag
 * @example http://semu.mp/tag/bananas
 **/
srv.all('/tag/:tagname', function(req, res) {
  var tagname = req.params.tagname;
  console.log(req.method, 'tag', tagname);
  mdb.getArticlesByTag(tagname, function(articles) {
    mdb.setMeta('url', mdb.getDefault('url') + req.url);
    mdb.setMeta('title', 'Tag: ' + tagname);
    mdb.setMeta('headline', 'Tagged with ' + tagname);  
    mdb.setMeta('current', 'posts');
    
    res.render('posts', mdb.jadeData({tags: mdb.getTagCloud(30, 14), list: articles}, req));
  });
});

/**
 * Display about
 * @example http://semu.mp/about
 */
// srv.all('/about', function(req, res) {
//   mdb.setMeta('url', mdb.getDefault('url') + req.url);
// 	mdb.setMeta('title', 'About');
	
//   res.render('about', mdb.jadeData({}, req));
// });

/**
 * Display Index
 * @example http://semu.mp/ 
 **/
srv.all('/', function(req, res) {

  mdb.setMeta('url', mdb.getDefault('url'));
	mdb.setMeta('title', 'Home, node-blog');
  mdb.setMeta('current', 'home');
  
  var page = 0;
  mdb.getArticles(0, function(articles) {
    return res.render('home', mdb.jadeData({list:articles}, req));
  });
});

/** TODO
 * Export RSS Feed
 * @example http://semu.mp/feed 
 **/
srv.all('/feed', function(req, res) {
  return res.render('feed', mdb.jadeData({url: mdb.getDefault('url') + req.url, layout: false, list: mdb.getArticles()}, req));
});

/**
 * Display single page or throw errors
 **/
srv.all('*', function(req, res, next) {
  throw new NotFound;
});

/**
 * FileNotFound Exception
 * @param string msg
 **/
function NotFound(msg) {
  this.name = 'NotFound';
  Error.call(this, msg);
  Error.captureStackTrace(this, arguments.callee);
} NotFound.prototype.__proto__ = Error.prototype;

/**
 * Trim strings
 * @param string str
 * @return array
 */
function trim(str) { return str.replace(/^\s\s*/, '').replace(/\s\s*$/, '').replace(/ +(?= )/g,''); }

/**
 *
 * Start node-blog
 *
 **/
var router = kickstart.listen();
console.log("Listening on http://%s:%d; (check that hostname is correct!)", kickstart.conf().name, router.address().port);
