var mdb = require('./mongoblog');
var Feed = require('feed'); 
var util = require('util');

var drongoPackageMetadata = require('./package.json');

/**
 * Load config JSON file
 **/
var config = JSON.parse(require('fs').readFileSync(__dirname + '/config.json','utf8'));
if (!util.isArray(config.host)) {
  config.host = [config.host];
}

/**
 * Set default category and set default URL
 **/
mdb.setDefault('category', 'General');
mdb.setDefault('url', 'http://' + config.host[0] + (config.port == '80' ? '' : ':' + config.port));

/**
 * Set basic variables passed to jade template
 **/
 
mdb.setMeta('site', config.siteName); 
mdb.setMeta('url', 'http://' + config.host[0]);
mdb.setMeta('author', config.author);
mdb.setMeta('disqus', config.disqus);

// add admin login
mdb.addLogin(config.admin);

// set mongo db connection info
mdb.setMongoConnectionString(config.mongoConnectionString);

/**
 * Start express.js http servr with kickstart (more: http://semu.mp/node-kickstart.html)

 **/
var kickstartConfig = {
  'name': config.host, 
  'port': config.port, 
  'path': __dirname
};
if (config.subsites) {
  kickstartConfig.subsites = config.subsites;
}
var kickstart = require('./kickstart').withConfig(kickstartConfig);
var srv = kickstart.srv();

/**
 * Set error handling
 **/
srv.error(function(err, req, res, next){
  if (err instanceof NotFound) {
    mdb.setMeta('url', mdb.getDefault('url') + req.url);
    mdb.setMeta('title', '404 - Not Found');
      
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
 * about/info/version handler
 **/
srv.get('/api/about', function(req, res) {
  var aboutInfo = {
    site: config.siteName,
    description: config.description,
    drongoVersion: drongoPackageMetadata.version
  };
  return res.end(JSON.stringify(aboutInfo)); 
});

/**
 * Callback for creating new articles
 **/
srv.all('/api/new', function(req, res) {
  var newName = null;
  if (req.session) {
    mdb.createNewArticle(req.body.name, req.body.slug, function(articleUrl) {
      console.log('article created', articleUrl);
      return res.end(articleUrl); 
    });
  } 
  else {
    return res.end(''); }
});

/**
 * Callback for getting drafts
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


/** TODO
 * Export RSS Feed
 * @example http://semu.mp/feed 
 **/
srv.all('/feed', function(req, response) {
  var res = response;

  var articles = mdb.getArticles(0, false, function(articles) {
    // set feed metadata
    var feed = new Feed({
        title:        config.siteName,
        description:  config.description,
        link:         mdb.getDefault('url') + '/',
        image:        mdb.getDefault('url') + '/img/CartoonMixer2011-150px.png',
        copyright:    'Copyright © 2013 ' + config.author + '. All rights reserved',
     
        author: {
            name:     config.author,
            email:    config.authorEmail,
            link:     mdb.getDefault('url')
        }
    });

    // add feed articles
    for(var i=0; i<articles.length; i++) {
      console.log(i, articles[i].date.getUTCFullYear(), articles[i].name);
      feed.addItem({
          title:          articles[i].name,
          link:           mdb.getDefault('url') + articles[i].url,
          description:    articles[i].html,
          date:           articles[i].date
      });
    }

    var feedText = feed.render('atom-1.0');
    //res.set('Content-Type', 'text/xml'); // I would like to do this, but request never completes ..
    res.send(feedText);
  }); 
});

/**
 * Display all posts available
 * @example http://semu.mp/posts
 **/
srv.all('/posts/:pageNumber?', function(req, res) {
  var pageNumber = req.params.pageNumber || 0;
  var hasSession = req.session.valid;
  var includeUnpublished = hasSession;

  pageNumber = parseInt(pageNumber, 10);
  pageNumber = pageNumber < 0 ? 0 : pageNumber;

  mdb.setMeta('url', mdb.getDefault('url') + req.url);
  //mdb.setMeta('title', 'Articles');
  mdb.setMeta('headline', 'page ' + pageNumber);
  mdb.setMeta('current', 'posts');  

  mdb.getArticles(pageNumber, includeUnpublished, function(articles) {
    var jadeData = {
      list: articles
    };
    if (pageNumber >= 1) {
      jadeData.prevPageUrl = '/posts/' + (pageNumber-1);
    }
    jadeData.nextPageUrl = '/posts/' + (pageNumber+1);

    res.render('posts', mdb.jadeData(jadeData, req));
  });
});

/**
 * Display tag list
 * @example http://semu.mp/tag/bananas
 **/
srv.all('/tags', function(req, res) {
  var hasSession = req.session.valid;

  mdb.getTagCloud(function(tags) {
    mdb.setMeta('url', mdb.getDefault('url') + req.url);
    
    res.render('tags', mdb.jadeData({tagCloud: tags}, req));
  });
});

/**
 * Display/update single blog post by slug
 * @example http://semu.mp/hello-world
 **/
srv.all('/:articleSlug', function(req, res) {
  var articleSlug = req.params.articleSlug;
  var updateData = req.param('data', null);
  var hasSession = req.session.valid;
  var includeUnpublished = hasSession;

  if (updateData && hasSession) {
    mdb.updateArticle(updateData, function(articleUrl) {
      res.send(articleUrl);
      return;    
    }); 
  }
  else {
    mdb.getArticle(articleSlug, includeUnpublished, function(item) {
    	if (!item) {
        res.statusCode = 404;
        res.render('errors/404', mdb.jadeData({url: req.url}, req)); 
        return;
      } 
  	  // if (item.url != mdb.getDefault('url') + req.url) {
  	  //   return res.redirect(item.url, 301); }
  	    
  		mdb.setMeta('url', item.url);
  		//mdb.setMeta('title', item.name);
  		mdb.setMeta('headline', item.name);	
  		mdb.setMeta('current', 'posts');
  		
  	  res.render('article', mdb.jadeData({article: item, auth: req.session.valid}, req));
    });
  }
});

/**
 * Display/update single blog post by id
 * @example http://semu.mp/postid/945ij4509mregop
 **/
srv.all('/postid/:postId', function(req, res) {
  var postId = req.params.postId;
  var hasSession = req.session.valid;
  var includeUnpublished = hasSession;

  console.log(req.method, 'article by id', postId);

  var updateData = req.param('data', null);
  var hasSession = req.session.valid;
  if (updateData && hasSession) {
    mdb.updateArticle(updateData, function(articleUrl) {
      res.send(articleUrl);
      return;    
    }); 
  }

  else {
    mdb.getArticleById(postId, includeUnpublished, function(item) {
      if (!item) {
        res.statusCode = 404;
        res.render('errors/404', mdb.jadeData({url: req.url}, req)); 
        return;
      } 
      // if (item.url != mdb.getDefault('url') + req.url) {
      //   return res.redirect(item.url, 301); }
        
      mdb.setMeta('url', item.url);
      //mdb.setMeta('title', item.name);
      mdb.setMeta('headline', item.name); 
      mdb.setMeta('current', 'posts');
      
      res.render('article', mdb.jadeData({article: item, auth: req.session.valid}, req));
    });
  }
});

/**
 * Display articles by tag
 * @example http://semu.mp/tag/bananas
 **/
// TODO: paging for tags 
srv.all('/tag/:taglist', function(req, res) {
  //var tagsArray = req.params.taglist.split(/\+|\//);
  var tagsArray = req.params.taglist.split('+');
  var hasSession = req.session.valid;
  var includeUnpublished = hasSession;

  console.log(req.method, 'tag', tagsArray);
  mdb.getArticlesByTag(tagsArray, includeUnpublished, function(articles) {
    mdb.setMeta('url', mdb.getDefault('url') + req.url);
    mdb.setMeta('headline', tagsArray);  
    mdb.setMeta('current', 'posts');
    
    res.render('posts', mdb.jadeData({list: articles}, req));
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
  var hasSession = req.session.valid;
  var includeUnpublished = hasSession;

  mdb.setMeta('url', mdb.getDefault('url'));
	//mdb.setMeta('title', 'Home, node-blog');
  mdb.setMeta('current', 'home');
  
  var pageNumber = 0;
  mdb.getArticles(pageNumber, includeUnpublished, function(articles) {
    var jadeData = { list: articles };
    jadeData.nextPageUrl = '/posts/' + (pageNumber+1);
    return res.render('home', mdb.jadeData(jadeData, req));
  });
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
console.log("Listening on http://%s:%d; (check that hostname is correct!)", kickstart.conf().name, kickstart.conf().port);
