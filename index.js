var express = require('express');
var medPage = require(__dirname + '/javascript/medication_page');
var scheduleMedPage = require(__dirname + '/javascript/schedule_page');
var settingsPage = require(__dirname + '/javascript/settings_page');
var remindersPage = require(__dirname + '/javascript/reminders_page');
var historyPage = require(__dirname + '/javascript/history_page');


const { Client } = require('pg');
var bodyParser = require("body-parser");
var session = require('express-session');
var cookie = require('cookie');
var hash = require('pbkdf2-password')()
const KnexSessionStore = require('connect-session-knex')(session);
const connection = new Client({
  // connectionString: process.env.DATABASE_URL,
  connectionString: "postgres://vuezzvdnlortow:a5e04be5858874386c6cf626e96c7a68be459df14f126977cbfc2d61425c963e@ec2-50-19-105-113.compute-1.amazonaws.com:5432/d65ul1majensrg",
  ssl: true



});
//db.connect();
//console.log(db);
const knex = require('knex')({
    client: 'pg',
    connection: {
      host: connection.host,
      port: connection.port,
      user: connection.user,
      password: connection.password,
      database: connection.database,
      ssl: true
    }
    //connection: process.env.DATABASE_URL
});

const store = new KnexSessionStore({
    knex: knex,
    tablename: 'sessions_store' // optional. Defaults to 'sessions'
});

//console.log(knex.select('*').from('users'));

var app = express();
app.set('port', (process.env.PORT || 5000));

// static content delivery
app.use(express.static(__dirname + '/public'));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(session({
  store: store,
  secret: "f6W;@En8&4;t^",//process.env.FOO_COOKIE_SECRET,
  saveUninitialized: false, // don't create session until something stored
  resave: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.get('/', restrict,  function(request, response) {
  var medicationPage = {
    page_title: 'Medication Reminders',
    data: []
  };

  var medname = request.query.medname;
  if (medname) {
    medicationPage.medname = medname;
  }

  knex.select('med_name', 'days', 'repeat', 'mid')
  .from('medications')
  .where('uid', '=', request.session.uid)
  .orderBy('mid', 'asc')
  .asCallback(function(err, rows) {
    if (err) console.log(err)
    for (var i = 0; i < rows.length; i++) {
      // console.log(rows[i].mid);
      medicationPage.data.push(rows[i]);
      medicationPage.data[i].days = JSON.parse(medicationPage.data[i].days);
    }
    response.render('pages/index', medicationPage);
  })
});
app.get('/med/new', restrict, function(request, response) {
  response.render('pages/new_med', scheduleMedPage);
});
app.post('/med/new', restrict, function(request, response) {
  // console.log(request.body)
  var med_name = request.body.med_name;
  var days = JSON.parse(request.body.days);
  var repeat = request.body.repeat;
  var start_time = request.body.start_time;
  var message = "";
  var arr = [];
  for (var key in days) {
    arr.push(days[key]);
  }
  days = arr;

  if (med_name.length == 0) {
    message = "Please write the name of your medication.";
    return response.render('pages/new_med', {page_title: 'Schedule Medication', message: message });
  }

  if (days.length == 0) {
    message = "Please select at least one day of the week.";
    return response.render('pages/new_med', {page_title: 'Schedule Medication', message: message });
  }

  knex.insert({uid: request.session.uid, med_name: med_name, days: JSON.stringify(days), repeat: repeat}).into('medications')
  .then(function () {
    return response.redirect('/');
  })
});
app.get('/settings', restrict, function(request, response) {
  response.render('pages/settings', settingsPage);
});
app.get('/reminders', restrict, function(request, response) {
  response.render('pages/reminders', remindersPage);
});
app.get('/history', restrict, function(request, response) {
  response.render('pages/history', historyPage);
});
app.get('/help', restrict, function(request, response) {
  response.render('pages/help',{page_title: 'Help'});
});
app.get('/login', function(request, response) {
  response.render('pages/login', {page_title: 'Login'});
});
app.get('/signup', function(request, response) {
  response.render('pages/signup', {page_title: 'Sign Up'});
});
app.get('/logout', function(request, response) {
  request.session.destroy(function(){
    response.redirect('/');
  });
});
app.post('/login', function(request, response){
  authenticate(request.body.username, request.body.password, function(err, user){
    if (err) {
      console.log(err.message);
      // log error stack on server maybe?
      return response.redirect('/login');
    }
    if (user) {
      // Regenerate session when signing in
      // to prevent fixation
      request.session.regenerate(function(){
        request.session.uid = user.uid;
        // request.session.success = 'Authenticated as ' + user.username;

        // apply this new session header
        request.session.save(function(err) {
          if (err) return console.log(err);
          response.redirect('/');
        })
      });
    } else {
      //request.session.error = 'z failed, please check your username and password.'
      response.redirect('/login');
    }
  });
});
app.post('/signup', function(request, response){
  var username = request.body.username;
  var password = request.body.password;
  var confirm = request.body.confirm;
  var message = "";

  if (username.length == 0 || password.length == 0) {
    message = "Bad username"
    return response.render('pages/signup', {page_title: 'Sign Up', message: message});
  }

  if (/^[a-zA-Z0-9- ]*$/.test(username) == false) {
    message = "Username can only contain letters and numbers";
    return response.render('pages/signup', {page_title: 'Sign Up', message: message});
  }

  if (password != confirm) {
    message = "passwords do not match";
    return response.render('pages/signup', {page_title: 'Sign Up', message: message});
  }

  knex.select('*').from('users').where('username', '=', username)
  .asCallback(function(err, rows) {
    if (err) return consle.log(new Error('SQL error'));
    var user = rows[0];
    if (!user) {
      hash({password: password }, function (err, pass, salt, hash) {
        if (err) throw err;
        knex.insert({username: username, hash: hash+salt}).into('users')
        .returning('uid')
        .then(function (uid) {
          request.session.regenerate(function(){
            request.session.uid = uid[0];
            // apply this new session header
            request.session.save(function(err) {
              if (err) return console.log(err);
              response.redirect('/');
            })
          });
        })
      });
    } else {
      message = "username already exists"
      response.render('pages/signup', {page_title: 'Sign Up', message: message});
    }
  });
});
app.get('/delete/:mid', restrict, function(request, response) {
  var mid = request.params.mid;
  knex.select('uid').from('medications').where('mid', '=', mid)
  .andWhere('uid', '=', request.session.uid)
  .asCallback(function(err, rows) {
    if (rows.length > 0) {
      knex('medications')
        .where('mid','=',mid)
        .del()
        .then(function () {
          // console.log('deleted ', mid)
          return response.redirect('/');
        });
    } else {
      console.log('medication %s does not exist or user has bad privileges', mid)
      return response.redirect('/');
    }
  })
  // check session uid owns the medication
});
app.get('/edit/:mid', restrict, function(request, response) {
  var mid = request.params.mid;
  knex.select('uid', 'med_name', 'days', 'repeat', 'mid').from('medications')
  .where('mid', '=', mid)
  .andWhere('uid', '=', request.session.uid)
  .asCallback(function(err, rows) {
    if (rows.length > 0) {
      var medication = rows[0];
      medication.days = JSON.parse(medication.days);
      return response.render('pages/edit', {page_title: 'Edit Medication', medication: medication});
    } else {
      // console.log('medication %s does not exist or user has bad privileges', mid)
      return response.redirect('/');
    }
  })
  // check session uid owns the medication
});
app.post('/edit/:mid', restrict, function(request, response) {
  var mid = request.params.mid;
  // console.log(request.body)
  knex('medications')
  .where('mid', '=', mid)
  .andWhere('uid', '=', request.session.uid)
  .update({
    med_name: request.body.med_name,
    days: request.body.days,
    repeat: request.body.repeat
  })
  .then(function (result) {
    // console.log(result);
    return response.redirect('/');
  })
});

function restrict(req, res, next) {
  if (req.session.uid) {
    next();
  } else {
    // console.log("no user");
    res.redirect('/login');
  }
}

function authenticate(uname, pass, cb) {
  //knex.raw('select * from users where uid = ?', [1]).on('query-error', function(error, obj) {
  knex.select('*').from('users').where('username', '=', uname)
  .asCallback(function(err, rows) {
    if (err) return cb(new Error('SQL error'));
    var user = rows[0];
    if (!user) {
       return cb(Error('User ' + uname + ' does not exist.'));
    }

    hash({ password: pass, salt: user.hash.substring(172)}, function (err, pass, salt, hash) {
      if (err) return cb(err);
      if (hash+salt == user.hash) {
        console.log(user.username + " logged in");
        return cb(null, user);
      }
      cb(new Error('Invalid password'));
    });
  })
}

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
