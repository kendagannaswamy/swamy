var express = require('express');
    cookieParser = require('cookie-parser'),
    compress = require('compression'),
    session = require('express-session'),
    bodyParser = require('body-parser'),  
    csrf = require('lusca').csrf(),
    methodOverride = require('method-override'),
    _ = require('lodash'),
    MongoStore = require('connect-mongo')({ session: session }),
    flash = require('express-flash'),
    path = require('path'),
    mongoose = require('mongoose'),
    passport = require('passport'),
    expressValidator = require('express-validator'),
    connectAssets = require('connect-assets'),
    ejs = require('ejs'),
    partials = require('express-partials'),
    i18n = require("i18n"),
    Site = require('./models/Site'),
    Forum = require('./models/Forum'),
    linkify = require("html-linkify"),
  app = express();

var hour = 3600000,
    day = hour * 24,
    week = day * 7;

/**
 * Automatically perform upgrade steps between versions, such as schema changes
 */
var migrationScript = require('./lib/migration-script');

/**
 * App configuration settings
 */
var config = {
  app: require('./config/app'),
  secrets: require('./config/secrets')
};

/**
 * Connect to MongoDB
 */



 mongoose.connect(config.secrets.db);
mongoose.connection.on('error', function() {
  console.error('MongoDB Connection Error. Make sure MongoDB is running.');
});

/**
 * CSRF URL whitelist
 */
var csrfExclude = [];

/**
 * i18n configuration
 */
i18n.configure({
    // setup some locales - other locales default to en silently
    locales:['en', 'de', 'fr', 'es'],
    defaultLocale: 'en',

    // set cookie name to parse locale settings from
    cookie: 'lang',

    // where to find json files
    directory: __dirname + '/locales',

    // whether to write new locale information to disk - defaults to true
    updateFiles: false,

    // what to use as the indentation unit - defaults to "\t"
    indent: "\t",
});



app.set('port', (process.env.PORT || 5000));
app.set('views', path.join(__dirname, 'views'));
// app.use(express.static(__dirname + '/public'));

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.engine('ejs', ejs.__express);
partials.register('.ejs', ejs);
app.use(partials());
app.use(compress());

app.use(connectAssets({
  paths: [path.join(__dirname, 'public/css'), path.join(__dirname, 'public/js')],
  helperContext: app.locals,
  compress: false
}));
// app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(expressValidator());
app.use(methodOverride());
app.use(cookieParser());
app.use(session({
  resave: true,
  saveUninitialized: true,
  secret: config.secrets.sessionSecret,
  store: new MongoStore({
    url: config.secrets.db,
    auto_reconnect: true
  }),
  cookie: {
    maxAge: 4 * week
  }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use(function(req, res, next) {
  // CSRF protection
  // Skip CSRF protection for white listed URLs
  if (_.contains(csrfExclude, req.path)) return next();
  // Skip CSRF protection for calls to the API (valid API Key required instead)
  if ((/^\/api/).test(req.path)) {
    res.locals._csrf = "undefined";
    return next();
  }
  csrf(req, res, next);
});
app.use(function(req, res, next) {
  // Set default page title based on configured site name
  res.locals.title = Site.getName();

  // Expose site config object to all templates
  res.locals.site = Site;

  // Make user object available in all templates
  res.locals.user = req.user;

  // Expose path to views
  res.locals.path = req.path;
  res.locals.url = Site.getUrl(req) + req.path;
  
  // Expose linkify (to escape content while making hyperliks work) to all views
  res.locals.linkify = linkify;

  // Expose post options (these will be populated before the server is started)
  // @todo Refactor to not use globals
  res.locals.forums = GLOBAL.forums;
  res.locals.topics = GLOBAL.topics;
  res.locals.priorities = GLOBAL.priorities;
  res.locals.states = GLOBAL.states;
  
  res.locals.newPostUrl = "/new";
  
  // Set req.api to true for requests made via the API
  if ((/^\/api/).test(req.path))
    req.api = true;
  
 next();
});


app.use(function(req, res, next) {
  // Remember original destination before login
  
  // Exceptions for paths we want to ignore
  // e.g. login pages, JavaScript files that make ajax calls
  var path = req.path.split('/')[1];
  if (/auth|login|css|images|logout|signup|js|fonts|favicon/i.test(path))
    return next();
  // Never return user to the account password reset page
  if (req.path == "/account/password")
    return next();

  // Ignore ajax requests (e.g. search type ahead, voting, favouriting, etc)
  if (req.xhr || req.headers.accept.indexOf('json') > -1)
    return next();
    
  req.session.returnTo = req.path;
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: week * 4 }));

/**
 * Route handlers
 */
var routes = {
  auth: require('./routes/auth'),
  user: require('./routes/user'),
  home: require('./routes/home'),
  contact : require('./routes/contact'),
  // posts: require('./routes/posts'),
  // forums: require('./routes/forums')
};

app.use(function(req, res, next) {
  // Open up to allow cross site origin requests from permitted domains
  // res.setHeader("Access-Control-Allow-Origin", "*");
  
  // Explicitly specify which headers and methods can be used by the client
  // This is required for compatiblity with some browser based REST clients
  // e.g. AngularJS
  // res.setHeader("Access-Control-Allow-Headers", "Origin,X-Requested-With,Content-Type,Accept,Session-Id,Api-Key");
  // res.setHeader("Access-Control-Allow-Methods", "POST,GET,OPTIONS,PUT,DELETE");

  if (req.method == "OPTIONS") {
      // Return immediately for all OPTIONS requests
      res.send();
  } else {
      next();
  }
});

if (Site.options().host != false) {
  if (Site.options().ssl === true) {
    console.log("HOST option specified. Requests to other hosts will be redirected to https://"+Site.options().host)
  } else {
    console.log("HOST option specified. Requests to other hosts will be redirected to http://"+Site.options().host)
  }
  app.use(function(req, res, next) {
    if (req.headers.host == Site.options().host)
      return next();
    
    if (Site.options().ssl === true) {
      res.redirect('https://' + Site.options().host + req.url);
    } else {
      res.redirect('http://' + Site.options().host + req.url);
    }
  });
}

if (Site.options().ssl == true) {
  console.log("FORCE_SSL option enabled. All requests will be redirected to HTTPS URLs")
  app.use(function(req, res, next) {
    var schema = req.headers['x-forwarded-proto'];
    if (schema === 'https') {
      // Already https; don't do anything special
      next();
    } else {
      // Redirect to https
      res.redirect('https://' + req.headers.host + req.url);
    }
  });
}

// app.get('/', function(request, response) {
//   response.render('pages/index');
// });
app.get('/', routes.home.index);
app.get('/login', routes.user.getLogin);
app.post('/login', routes.user.postLogin);
app.get('/logout', routes.user.logout);
app.get('/reset-password', routes.user.getResetPassword);
app.post('/reset-password', routes.user.postResetPassword);
app.get('/change-password/:token', routes.user.getChangePassword);
app.post('/change-password/:token', routes.user.postChangePassword);
app.get('/signup', routes.user.getSignup);
app.post('/signup', routes.user.postSignup);
app.get('/contact', routes.contact.getContact);
app.post('/contact', routes.contact.postContact);
app.get('/profile', routes.auth.isAuthenticated, routes.user.getAccount);
app.get('/account', routes.auth.isAuthenticated, routes.user.getAccount);
app.get('/account/profile', routes.auth.isAuthenticated, routes.user.getAccount);
app.post('/account/profile', routes.auth.isAuthenticated, routes.user.postUpdateProfile);
app.get('/account/verify', routes.auth.isAuthenticated, routes.user.getAccountVerify);
app.post('/account/verify', routes.auth.isAuthenticated, routes.user.postAccountVerify);
app.get('/account/verify/:token', routes.auth.isAuthenticated, routes.user.getAccountVerifyToken);

if (Site.options().api == true)
  app.post('/account/profile/apikey', routes.auth.isAuthenticated, routes.user.postApiKey);

app.post('/account/password', routes.auth.isAuthenticated, routes.user.postUpdatePassword);
app.post('/account/delete', routes.auth.isAuthenticated, routes.user.postDeleteAccount);
app.get('/account/unlink/:provider', routes.auth.isAuthenticated, routes.user.getOauthUnlink);
 

 app.use(function (err, req, res, next) {
    // treat as 404
    if (err.message
      && (~err.message.indexOf('not found')
      || (~err.message.indexOf('Cast to ObjectId failed')))) {
      return next();
    }
    // @todo: Log error with remote error service
    console.error(err.stack);
    // @todo Redirect to self-contained error page which does not require any variables beyond those declared here
    res.status(500).render('500', { error: err.stack, title: Site.getName() });
  });

  /**
   * 404 File Not Found Handler
   */
  app.use(function (req, res, next) {
    res.status(404).render('404', { url: req.originalUrl });
  });
  
app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});

module.exports = app;