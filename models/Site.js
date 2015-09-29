var Q = require('q'),
    slug = require('slug');

var config = {
  app: require('../config/app'),
  secrets: require('../config/secrets')
};

module.exports = function() {
  
  this.getName = function() {
     return config.app.name;
  }
  
  this.getDescription = function() {
     return config.app.description;
  }

  this.getEmail = function() {
     return config.app.email;
  }
  
  this.options = function() {
    
    // If true, forces all URLs to be HTTPS
    var ssl = false;
    if (config.app.ssl != false && config.app.ssl != "false")
      ssl = true;
    
    // If a host is specified, force all URLs to at that domain
    // This can be combined with the SSL option if you have domains or hostnames but only a valid SSL certificate for one of them.
    var host = false;
    if (config.app.host != false && config.app.host != "false")
      host = config.app.host;

    var forums = false;
    if (config.app.forums.length > 0)
      forums = true;
    
    return {
      ssl: ssl,
      host: host,
      api: config.app.api,
      forums: forums,
      // post: {
      //   name: config.app.posts.name,
      //   slug: slug(config.app.posts.name.toLowerCase()),
      //   icon: config.app.posts.icon,
      //   voting: {
      //     enabled: true
      //   },
      //   markdown: config.app.posts.markdown
      // }
    };
  }

  this.loginOptions = function(provider) {
    switch (provider) {
      case "facebook":
        if (config.secrets.facebook.clientID != '')
          return true;
        break;
      case "google":
        if (config.secrets.google.clientID != '')
          return true;
        break;
      case "twitter":
        if (config.secrets.twitter.consumerKey != '')
          return true;
        break;
      case "github":
        if (config.secrets.github.clientID != '')
          return true;
        break;
      default:
        return false;
    }
  }
  
  this.getMailTransport = function() {
    // @todo Add support for other mail services
    if (config.secrets.sendgrid.user != "" && config.secrets.sendgrid.password != "") {
      // Use sendgrid service if configured
      return {
        service: 'SendGrid',
        auth: {
          user: config.secrets.sendgrid.user,
          pass: config.secrets.sendgrid.password
        }
      };
    } else {
      // Use direct SMTP mail service if no mail service configured
      return null;
    }
  }
  
  this.getUrl = function(req) {
    var host = req.headers.host;
    if (config.app.host != false && config.app.host != "false")
      host = config.app.host;

    if (this.options().ssl == true) {
      return 'https://' + host;
    } else {
      return'http://' + host;
    }
  }
  
  return this;
}();