var _ = require('lodash'),
    async = require('async'),
    crypto = require('crypto'),
    nodemailer = require('nodemailer'),
    passport = require('passport'),
    User = require('../models/User'),
    Site = require('../models/Site');

var config = {
  app: require('../config/app'),
  secrets: require('../config/secrets')
};

/**
 * GET /login
 * Login page.
 */
exports.getLogin = function(req, res) {
  if (req.user) return res.redirect('/');
  res.render('account/login', { title: "Log in" });
};

/**
 * POST /login
 * Sign in using email and password.
 * @param email
 * @param password
 */
exports.postLogin = function(req, res, next) {
  req.assert('email', 'Email address invalid').isEmail();
  req.assert('password', 'Password cannot be blank').notEmpty();

  var errors = req.validationErrors();

  if (errors) {
    if (req.headers['x-validate']) {
      return res.json({ errors: errors });
    } else {
      req.flash('errors', errors);
      return res.render('account/login');
    }
  }
  
  passport.authenticate('local', function(err, user, info) {
    if (err) return next(err);
    if (!user) {
      if (req.headers['x-validate']) {
        return res.json({ errors: [ { param: 'email', msg: ''}, { param: 'password', msg: 'Email address invalid or password' } ] });
      } else {
        req.flash('errors', { msg: info.message });
        return res.redirect('/login');
      }
    }
    req.logIn(user, function(err) {
      if (err) return next(err);
      //req.flash('success', { msg: 'Success! You are logged in.' });
      res.redirect(req.session.returnTo || '/');
    });
  })(req, res, next);
};

/**
 * GET /logout
 * Log out.
 */
exports.logout = function(req, res) {
  req.logout();
  res.redirect('/');
};

/**
 * GET /signup
 * Signup page.
 */
exports.getSignup = function(req, res) {
  if (req.user) return res.redirect('/account');
  res.render('account/signup', { title: "Sign up" });
};

/**
 * POST /signup
 * Create a new local account.
 * @param email
 * @param password
 */
exports.postSignup = function(req, res, next) {
  if (req.user) return res.redirect('/account');
  
  req.assert('email', 'Email address invalid').isEmail();
  req.assert('password', 'Password must be at least 4 characters').len(4);
  req.assert('confirmPassword', 'Passwords do not match').equals(req.body.password);

  var errors = req.validationErrors();

  if (errors) {
    if (req.headers['x-validate']) {
      return res.json({ errors: errors });
    } else {
      req.flash('errors', errors);
      return res.render('account/signup');
    }
  }

  // If user does not exist, create account
  var user = new User({
    email: req.body.email,
    password: req.body.password,
    emailVerificationToken: crypto.randomBytes(16).toString('hex')
  });
  
  User.findOne({ email: req.body.email }, function(err, existingUser) {
    // Check if user exists already
    if (existingUser) {
      var msg = 'An account with that email address already exists';
      if (req.headers['x-validate']) {
        return res.json({ errors: [ { param: 'email', msg: msg } ] });
      } else {
        req.flash('errors', { param: 'email', msg: msg });
        return res.render('account/signup');
      }
    }
    
    // If it's just a validation request, return without error
    if (req.headers['x-validate'])
      return res.json({ errors: [] });
    
    user.save(function(err) {
      if (err) return next(err);
      req.logIn(user, function(err) {
        if (err) return next(err);
        
        // Trigger sending an email address verification email 
        var transporter = nodemailer.createTransport(Site.getMailTransport());
        var mailOptions = {
          to: user.email,
          from: config.app.email,
          subject: 'Verify your email address',
          text: 'You are receiving this email to verify the email address you entered at '+Site.getUrl(req)+'.\n\n'+
                'Follow the link below to verify your email address.\n\n'+
                 Site.getUrl(req)+'/account/verify/'+user.emailVerificationToken+'\n\n'+
                '\n\n-- \n'
        };
        transporter.sendMail(mailOptions, function(err) {
          return res.redirect(req.session.returnTo || '/');
        });
      });
    });
    
  });
};

/**
 * GET /account
 * Profile page.
 */
exports.getAccount = function(req, res) {
  res.render('account/profile', { title: "Your profile" });
};

/**
 * POST /account/profile
 * Update profile information.
 * @fixme Calling with x-validate actually causes the update to happen.
 *        This isn't causing any problems but is not intended behaviour.
 */
exports.postUpdateProfile = function(req, res, next) {
  req.assert('email', 'Email address invalid').isEmail();

  var errors = req.validationErrors();

  if (errors) {
    if (req.headers['x-validate']) {
      return res.json({ errors: errors });
    } else {
      req.flash('errors', errors);
      return res.render('account/profile');
    }
  }
  
  User.findById(req.user.id, function(err, user) {
        
    if (err) return next(err);

    // If the email address has changed reset account verification status    
    var sendVerificationEmail = false;
    if (user.email != req.body.email) {
      sendVerificationEmail = true;
      user.verified = false;
      user.emailVerificationToken = null;
    }

    //  Create new verification token if there isn't one
    if (!user.emailVerificationToken)
      user.emailVerificationToken = crypto.randomBytes(16).toString('hex');
    
    user.email = req.body.email || '';
    user.profile.name = req.body.name || '';
    user.profile.organization = req.body.organization || '';
    user.profile.location = req.body.location || '';
    user.profile.website = req.body.website || '';

    user.save(function(err) {
      // Check for duplicate email addresses
      // Two accounts are not allowed have the same email address
      if (err) {
        if (err.code == '11000') {
          var msg = 'An account with that email address already exists.';
          if (req.headers['x-validate']) {
            return res.json({ errors: [ { param: 'email', msg: msg } ] });
          } else {
            req.flash('errors', { param: 'email', msg: msg });
            return res.render('account/signup');
          }
        } else {
          // Other errors
          if (err) return next(err);
        }
      }
      // If they use is not verified and their email address has changed send 
      // verification email
      if (sendVerificationEmail == true) {
        var transporter = nodemailer.createTransport(Site.getMailTransport());
        var mailOptions = {
          to: user.email,
          from: config.app.email,
          subject: 'Verify your email address',
          text: 'You are receiving this email to verify the email address you entered at '+Site.getUrl(req)+'.\n\n'+
                'Follow the link below to verify your email address.\n\n'+
                 Site.getUrl(req)+'/account/verify/'+user.emailVerificationToken+'\n\n'+
                '\n\n-- \n'
        };
        transporter.sendMail(mailOptions, function(err) {
          return res.redirect('/profile')
        });
      } else {
        req.flash('success', { msg: 'Your profile has been updated.' });
        return res.redirect('/profile')
      }
    });
  });
};

/**
 * POST /account/password
 * Update current password.
 * @param password
 */
exports.postUpdatePassword = function(req, res, next) {
  req.assert('password', 'Password must be at least 4 characters').len(4);
  req.assert('confirmPassword', 'Passwords do not match').equals(req.body.password);

  var errors = req.validationErrors();

  if (req.headers['x-validate'])
    return res.json({ errors: errors });

  if (errors) {
    req.flash('errors', errors);
    return res.render('account');
  }

  User.findById(req.user.id, function(err, user) {
    if (err) return next(err);

    user.password = req.body.password;

    user.save(function(err) {
      if (err) return next(err);
      req.flash('success', { msg: 'Your password has been changed.' });
      res.redirect('/account');
    });
  });
};

/**
 * POST /account/delete
 * Delete user account.
 */
exports.postDeleteAccount = function(req, res, next) {
  User.remove({ _id: req.user.id }, function(err) {
    if (err) return next(err);
    req.logout();
    req.flash('info', { msg: 'Your account has been deleted.' });
    res.redirect('/');
  });
};

/**
 * GET /account/unlink/:provider
 * Unlink OAuth provider.
 * @param provider
 */
exports.getOauthUnlink = function(req, res, next) {
  var provider = req.params.provider;
  User.findById(req.user.id, function(err, user) {
    if (err) return next(err);

    user[provider] = undefined;
    user.tokens = _.reject(user.tokens, function(token) { return token.kind === provider; });
    
    var providerName = provider.substr(0, 1).toUpperCase() + provider.substr(1);
    user.save(function(err) {
      if (err) return next(err);
      req.flash('info', { msg: "Your " + providerName + ' account has been unlinked.' });
      res.redirect('/account');
    });
  });
};

/**
 * GET /change-password/:token
 * Reset Password page.
 */
exports.getChangePassword = function(req, res) {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }
  User
    .findOne({ resetPasswordToken: req.params.token })
    .where('resetPasswordExpires').gt(Date.now())
    .exec(function(err, user) {
      if (!user) {
        req.flash('errors', { msg: 'Password reset token is invalid or has expired.' });
        return res.redirect('/reset-password');
      }
      res.render('account/change-password', { title: "Change password" });
    });
};

/**
 * POST /change-password/:token
 * Process the reset password request.
 * @param token
 */
exports.postChangePassword = function(req, res, next) {
  req.assert('password', 'Password must be at least 4 characters').len(4);
  req.assert('confirm', 'Passwords do not match').equals(req.body.password);

  var errors = req.validationErrors();

  if (errors) {
    req.flash('errors', errors);
    return res.redirect('back');
  }

  async.waterfall([
    function(done) {
      User
        .findOne({ resetPasswordToken: req.params.token })
        .where('resetPasswordExpires').gt(Date.now())
        .exec(function(err, user) {
          if (!user) {
            req.flash('errors', { msg: 'Password reset token is invalid or has expired.' });
            return res.redirect('back');
          }

          user.password = req.body.password;
          user.resetPasswordToken = undefined;
          user.resetPasswordExpires = undefined;

          user.save(function(err) {
            if (err) return next(err);
            req.logIn(user, function(err) {
              done(err, user);
            });
          });
        });
    },
    function(user, done) {
      var transporter = nodemailer.createTransport(Site.getMailTransport());
      var mailOptions = {
        to: user.email,
        from: config.app.email,
        subject: 'Your password has been changed',
        text: 'Hello,\n\n' +
              'This is a confirmation that the password for your account ' + user.email + ' has just been changed.\n' +
              '\n\n-- \n'
      };
      transporter.sendMail(mailOptions, function(err) {
        req.flash('success', { msg: 'Success! Your password has been changed.' });
        done(err);
      });
    }
  ], function(err) {
    if (err) return next(err);
    res.redirect('/');
  });
};

/**
 * GET /reset-password
 * Forgot Password page.
 */
exports.getResetPassword = function(req, res) {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }
  res.render('account/reset-password', { title: "Password reset" });
};

/**
 * POST /reset-password
 * Create a random token, then the send user an email with a reset link.
 * @param email
 */
exports.postResetPassword = function(req, res, next) {
  req.assert('email', 'Email address invalid').isEmail();

  var errors = req.validationErrors();

  if (errors) {
    if (req.headers['x-validate']) {
      return res.json({ errors: errors });
    } else {
      req.flash('errors', errors);
      return res.redirect('/reset-password');
    }
  }

  async.waterfall([
    function(done) {
      crypto.randomBytes(16, function(err, buf) {
        var token = buf.toString('hex');
        done(err, token);
      });
    },
    function(token, done) {
      User.findOne({ email: req.body.email.toLowerCase() }, function(err, user) {
        if (!user) {
          var msg = "That isn't the email address you signed up with";
          if (req.headers['x-validate']) {
            return res.json({ errors: [ { param: 'email', msg: msg } ] });
          } else {
            req.flash('errors', { msg: msg });
            return res.redirect('/reset-password');
          }
        }
        
        if (req.headers['x-validate'])
          return res.json({ errors: [] });

        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

        user.save(function(err) {
          done(err, token, user);
        });
      });
    },
    function(token, user, done) {
      var transporter = nodemailer.createTransport(Site.getMailTransport());
      
      var text = 'You are receiving this email because you (or someone else) has requested the reset of the password for your account.\n\n' +
                 'Please click on the following link, or paste this into your browser to complete the process:\n\n';
    
      if (Site.options().ssl == true) {
        text += 'https://' + req.headers.host + '/change-password/' + token + '\n\n';
      } else {
        text += 'http://' + req.headers.host + '/change-password/' + token + '\n\n';
      }
              
      text += 'If you did not request this, please ignore this email and your password will remain unchanged.\n' +
              '\n\n-- \n';
              
      var mailOptions = {
        to: user.email,
        from: config.app.email,
        subject: 'Password reset',
        text: text
      };
      transporter.sendMail(mailOptions, function(err) {
        if (err) {
          req.flash('errors', { msg: 'Unable to send password reset email. Please check your address.' });
        } else {
          req.flash('info', { msg: 'An email has been sent to you with further instructions.' });
        }
        done(err, 'done');
      });
    }
  ], function(err) {
    if (err) return next(err);
    res.redirect('/reset-password');
  });
};

/**
 * POST /account/profile/apikey
 * Fetch a users API Key (generates a one if it doesn't exist)
 */
exports.postApiKey = function(req, res, next) {  
  User.findById(req.user.id, function(err, user) {
    if (err) return next(err);

    user.apiKey = crypto.randomBytes(16).toString('hex');
    
    user.save(function(err) {
      
      if (!user.email)
        if (err) return next(err);

      var transporter = nodemailer.createTransport(Site.getMailTransport());
      var mailOptions = {
        to: user.email,
        from: config.app.email,
        subject: 'Your API Key',
        text: 'You are receiving this email because you have requested an API Key for '+Site.getUrl(req)+'.\n\n'+
              'Your API Key: '+user.apiKey+'\n\n'+
              'This key uniquely identifies you and can be used to access the API with the same permissions as your account.\n\n'+
              '\n\n-- \n'
      };
      transporter.sendMail(mailOptions, function(err) {
        if (err) {
          req.flash('errors', { msg: 'Unable to send API Key via email. Please check your address.' });
        } else {
          req.flash('success', { msg: 'An email has been sent to you with your API Key.' });
        }
        res.redirect('/profile');
      });
    });
  });
};


/**
 * GET /profile/verify
 * Verify email address
 */
exports.getAccountVerify = function(req, res) {
  res.render('account/verify', { title: "Verify your email address" });
};


/**
 * POST /profile/verify
 * Verify email address
 */
exports.postAccountVerify = function(req, res) {
  User.findById(req.user.id, function(err, user) {
    if (err) return next(err);

    if (!user.emailVerificationToken)
      user.emailVerificationToken = crypto.randomBytes(16).toString('hex');
    
    user.save(function(err) {
      if (!user.email)
        if (err) return next(err);

      var transporter = nodemailer.createTransport(Site.getMailTransport());
      var mailOptions = {
        to: user.email,
        from: config.app.email,
        subject: 'Verify your email address',
        text: 'You are receiving this email to verify the email address you entered at '+Site.getUrl(req)+'.\n\n'+
              'Follow the link below to verify your email address.\n\n'+
               Site.getUrl(req)+'/account/verify/'+user.emailVerificationToken+'\n\n'+
              '\n\n-- \n'
      };
      transporter.sendMail(mailOptions, function(err) {
        if (err) {
          req.flash('errors', { msg: 'Unable to send verification email. Please check your address.' });
          return res.redirect('/profile');
        } else {
          return res.render('account/verify-confirm', { title: "Verify your email address" });
        }
      });
    });
  });
};

/**
 * POST /profile/verify
 * Verify email address
 */
exports.getAccountVerifyToken = function(req, res) {
  User
  .findOne({ emailVerificationToken: req.params.token })
  .exec(function(err, user) {
    if (!user)
      return res.render('account/verify-invalid', { title: "Verify your email address" });

    user.verified = true;

    user.save(function(err) {
      if (err) return next(err);
      req.flash('success', { msg: 'E-mail address verified.' });
      return res.redirect('/profile');
    });
  });
};