var express = require('express');
var medPage = require(__dirname + '/javascript/medication_page');
var scheduleMedPage = require(__dirname + '/javascript/schedule_page');
var settingsPage = require(__dirname + '/javascript/settings_page');
var remindersPage = require(__dirname + '/javascript/reminders_page');
var historyPage = require(__dirname + '/javascript/history_page');
var httpsRedirect = require('express-https-redirect');
const moment = require('moment');
const { spawn } = require('child_process');
const { Client } = require('pg');
var bodyParser = require("body-parser");
var session = require('express-session');
var cookie = require('cookie');
var hash = require('pbkdf2-password')()
const KnexSessionStore = require('connect-session-knex')(session);
const connection = new Client({
  connectionString: process.env.DATABASE_URL,
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

const NOTIFICATION_INTERVAL = 60000; // 1 minute

var app = express();
app.set('port', (process.env.PORT || 5000));

app.use('/', httpsRedirect());
// static content delivery
app.use(express.static(__dirname + '/public'));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(session({
  store: store,
  secret: process.env.COOKIE_SECRET,
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

  knex.select('med_name', 'type', 'days', 'type', 'repeat', 'medications.mid', 'active_on', 'remind_time')
  .from('medications')
  .leftOuterJoin('remind_times', 'medications.mid', 'remind_times.mid')
  .whereNull('deleted')
  .andWhere('uid', '=', request.session.uid)
  .orderBy('mid', 'desc')
  .asCallback(function(err, rows) {
    if (err) console.log(err)

    var now = moment();
    var remindersSwitch = false;
    for (var i = 0; i < rows.length; i++) {
      var isActive = false;
      var next_dose = getNextReminderMoment(rows[i].active_on, rows[i].type, JSON.parse(rows[i].days), rows[i].repeat, rows[i].remind_time);

      if (rows[i].active_on == null || moment(parseInt(rows[i].active_on)).isBefore(now)) {
        isActive = true;
        remindersSwitch = true;
      }
      // if we are adding a new remind time for the same medication
      if (i > 0 && rows[i-1].mid == rows[i].mid) {
        // simply push the time to its remind_times array
        medicationPage.data[medicationPage.data.length-1].remind_times.push(rows[i].remind_time);
        if (next_dose.valueOf() < medicationPage.data[medicationPage.data.length-1].next_dose) {
          medicationPage.data[medicationPage.data.length-1].next_dose = next_dose.valueOf();
        }
      }
      else {
        medicationPage.data.push({
          med_name: rows[i].med_name,
          type: rows[i].type,
          days: JSON.parse(rows[i].days),
          repeat: rows[i].repeat,
          mid: rows[i].mid,
          active: isActive,
          remind_times: [rows[i].remind_time],
          next_dose: next_dose.valueOf()
        });
      }
    }
    //console.log(medicationPage);
    medicationPage.remindersSwitch = remindersSwitch;
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
  //var start_time = request.body.start_time;
  //var time = request.body.time;
  var times =  JSON.parse(request.body.times);
  var type = request.body.type;
  var message = "";
  var arr = [];
  for (var key in days) {
    arr.push(days[key]);
  }
  days = arr;

  knex.insert({
    uid: request.session.uid,
    med_name: med_name,
    type: type,
    days: JSON.stringify(days),
    repeat: repeat
  }).into('medications')
  .returning('mid')
  .then(function (mid) {
    var remind_times = [];
    for (var i = 0; i < times.length; i++) {
      remind_times.push({
        mid: mid[0],
        remind_time: times[i]
      });
    }
    knex.insert(remind_times)
    .into('remind_times')
    .then(function() {
      return response.sendStatus(200);
    })
  })
});
app.get('/landing', function(request, response) {
  response.render('pages/landing_page', {page_title: 'Welcome!'});
});
app.get('/settings', restrict, function(request, response) {
  knex.select('notifications')
  .from('users')
  .where('uid', '=', request.session.uid)
  .asCallback(function(err, rows) {
    if (err) console.log(err)

    response.render('pages/settings', {
      page_title:'Settings',
      notifications: rows[0].notifications
    });
  })
});
app.get('/settings2', restrict, function(request, response) {
  knex.select('notifications')
  .from('users')
  .where('uid', '=', request.session.uid)
  .asCallback(function(err, rows) {
    if (err) console.log(err)

    response.render('pages/settings2', {
      page_title:'Settings',
      notifications: rows[0].notifications
    });
  })
});
app.get('/reminders', restrict, function(request, response) {
  response.render('pages/reminders', remindersPage);
});
app.get('/history', restrict, function(request, response) {
  var historyPage = {
    page_title: 'Recover Reminders',
    data: []
  };

  knex.select('med_name', 'type', 'days', 'type', 'repeat', 'medications.mid', 'active_on', 'remind_time')
  .from('medications')
  .leftOuterJoin('remind_times', 'medications.mid', 'remind_times.mid')
  .whereNotNull('deleted')
  .andWhere('uid', '=', request.session.uid)
  .orderBy('mid', 'desc')
  .asCallback(function(err, rows) {
    if (err) console.log(err)

    var now = moment();
    var remindersSwitch = false;
    for (var i = 0; i < rows.length; i++) {
      var isActive = false;
      var next_dose = getNextReminderMoment(rows[i].active_on, rows[i].type, JSON.parse(rows[i].days), rows[i].repeat, rows[i].remind_time);

      if (rows[i].active_on == null || moment(parseInt(rows[i].active_on)).isBefore(now)) {
        isActive = true;
        remindersSwitch = true;
      }
      // if we are adding a new remind time for the same medication
      if (i > 0 && rows[i-1].mid == rows[i].mid) {
        // simply push the time to its remind_times array
        historyPage.data[historyPage.data.length-1].remind_times.push(rows[i].remind_time);
        if (next_dose.valueOf() < historyPage.data[historyPage.data.length-1].next_dose) {
          historyPage.data[historyPage.data.length-1].next_dose = next_dose.valueOf();
        }
      }
      else {
        historyPage.data.push({
          med_name: rows[i].med_name,
          type: rows[i].type,
          days: JSON.parse(rows[i].days),
          repeat: rows[i].repeat,
          mid: rows[i].mid,
          active: isActive,
          remind_times: [rows[i].remind_time],
          next_dose: next_dose.valueOf()
        });
      }
    }

    historyPage.remindersSwitch = remindersSwitch;
    response.render('pages/history', historyPage);
  })
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
  var message = "Invalid username/password. Please try again.";
  authenticate(request.body.username, request.body.password, function(err, user){
    if (err) {
      console.log(err.message);
      // log error stack on server maybe?
      return response.render('pages/login', {page_title: 'Login', message: message });
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
          return response.redirect('/');
        })
      });
    } else {
      return response.render('pages/login', {page_title: 'Login', message: message });
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
    if (err) return console.log(new Error('SQL error'));
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
app.post('/register', restrict, function(request, response) {
  var subscription = null;
  if (request.body.subscription) {
    subscription = JSON.parse(request.body.subscription);
  }
  // delete (unregister) all other subscriptions for this user
  knex('subscriptions')
  .where('uid', '=', request.session.uid)
  .del()
  .then(function (result) {
    if (subscription) {
       // subscription exists, create a new one
      knex.insert({
        uid: request.session.uid,
        subscription: subscription
      }).into('subscriptions')
      .then(function () {
        return response.sendStatus(200);
      })
    } else {
      return response.sendStatus(200);
    }
  })
});
app.get('/delete/:mid', restrict, function(request, response) {
  var mid = request.params.mid;
  knex.select('uid').from('medications').where('mid', '=', mid)
  .andWhere('uid', '=', request.session.uid)
  .asCallback(function(err, rows) {
    if (rows.length > 0) {
      knex('medications')
        .where('mid','=',mid)
        .update({
          deleted: knex.fn.now()
        })
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
  knex.select('med_name', 'type', 'days', 'repeat', 'medications.mid', 'active_on', 'remind_time')
  .from('medications')
  .leftOuterJoin('remind_times', 'medications.mid', 'remind_times.mid')
  .whereNull('deleted')
  .andWhere('medications.mid', '=', mid)
  .andWhere('uid', '=', request.session.uid)
  .asCallback(function(err, rows) {
    if (err) console.log(err)
    if (rows.length == 0) {
      return response.redirect('/');
    }

    var medication = {
      med_name: rows[0].med_name,
      type: rows[0].type,
      days: JSON.parse(rows[0].days),
      repeat: rows[0].repeat,
      mid: rows[0].mid,
      remind_times: [rows[0].remind_time]
    };

    // if there are more remind times for this medication, add them
    for (var i = 1; i < rows.length; i++) {
      medication.remind_times.push(rows[i].remind_time);
    }

    return response.render('pages/edit', {page_title: 'Edit Medication', medication: medication});
  });
});
app.post('/edit/:mid', restrict, function(request, response) {
  var mid = request.params.mid;
  var med_name = request.body.med_name;
  var days = JSON.parse(request.body.days);
  var repeat = request.body.repeat;
  //var start_time = request.body.start_time;
  var times =  JSON.parse(request.body.times);
  var type = request.body.type;

  var message = "";
  var arr = [];
  for (var key in days) {
    arr.push(days[key]);
  }
  days = arr;
  // console.log(request.body)

  knex('medications')
  .where('mid', '=', mid)
  .andWhere('uid', '=', request.session.uid)
  .update({
    med_name: request.body.med_name,
    days: request.body.days,
    repeat: request.body.repeat,
    type: request.body.type
  })
  .then(function (result) {
    knex('remind_times')
    .where('mid', '=', mid)
    .del()
    .then(function(result) {
      var remind_times = [];
      for (var i = 0; i < times.length; i++) {
        remind_times.push({
          mid: mid,
          remind_time: times[i]
        });
      }
      knex.insert(remind_times)
      .into('remind_times')
      .then(function() {
        return response.sendStatus(200);
      });
    });
  });
});
app.post('/modifyNotification', restrict, function(request, response) {
  var mid = request.body.mid;
  var active_on;
  if (!request.body.local) {
    active_on = null;
  } else {
    active_on = request.body.local;
  }

  knex('medications')
  .where('mid', '=', mid)
  .andWhere('uid', '=', request.session.uid)
  .update({
    active_on: active_on
  })
  .then(function (result) {
    // console.log(result);
    return response.sendStatus(200);
  })

});
app.post('/modifyUserNotification', restrict, function(request, response) {
  knex('users')
  .where('uid', '=', request.session.uid)
  .update({
    notifications: request.body.enable
  })
  .then(function (result) {
    // console.log(result);
    return response.sendStatus(200);
  })
});
app.post('/resumeAllNotifications', restrict, function(request, response) {
  knex('medications')
  .where('uid', '=', request.session.uid)
  .update({
    active_on: null
  })
  .then(function (result) {
    return response.sendStatus(200);
  })
});
app.post('/pauseAllNotifications', restrict, function(request, response) {
  knex('medications')
  .where('uid', '=', request.session.uid)
  .update({
    active_on: request.body.local
  })
  .then(function (result) {
    return response.sendStatus(200);
  })
});
app.post('/recover/:mid', restrict, function(request, response) {
  var mid = request.params.mid;
  knex('medications')
  .where('mid', '=', mid)
  .andWhere('uid', '=', request.session.uid)
  .update({
    deleted: null
  })
  .then(function (result) {
    return response.sendStatus(200);
  })
});

function restrict(req, res, next) {
  if (req.session.uid) {
    next();
  } else {
    // console.log("no user");
    res.redirect('/landing');
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

function getNextReminderMoment(active_on, type, days, repeat, remind_time) {
  var nowMoment = moment();
  var remindMoment = moment(parseInt(remind_time));
  var reminderToday = moment(remindMoment.hour()+":"+remindMoment.minutes(), "HH:mm");
  var returnMoment = reminderToday;

  if (type == "1") {
    var currentDay = returnMoment.weekday();
    var dayIndex = 0;
    for (var i = 0; i < 7; i++) {
      if (currentDay == 0) {
        dayIndex = days.indexOf('S');
      } else if (currentDay == 1) {
        dayIndex = days.indexOf('M');
      } else if (currentDay == 2) {
        dayIndex = days.indexOf('T');
      } else if (currentDay == 3) {
        dayIndex = days.indexOf('W');
      } else if (currentDay == 4) {
        dayIndex = days.indexOf('Th');
      } else if (currentDay == 5) {
        dayIndex = days.indexOf('F');
      } else if (currentDay == 6) {
        dayIndex = days.indexOf('Sa');
      }
      
      if (dayIndex != -1 && reminderToday.isAfter(nowMoment)) {
        break;
      }
      returnMoment.add(1, 'day');
      currentDay = returnMoment.weekday();
    }
    return returnMoment;

  } else if (type == "2") {

    if (remindMoment.isAfter(nowMoment)) { // reminder hasnt happened yet.
      return remindMoment;
    }

    var duration = moment.duration(nowMoment.diff(reminderToday));
    var hoursApart = Math.abs(duration.asHours());
    nowMoment.add(repeat - (hoursApart % repeat), 'hour');
    return nowMoment;
  }
}

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
