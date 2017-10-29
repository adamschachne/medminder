var express = require('express');
var medPage = require(__dirname + '/public/javascript/medication_page');
var scheduleMedPage = require(__dirname + '/public/javascript/schedule_page');
var settingsPage = require(__dirname + '/public/javascript/settings_page');
var remindersPage = require(__dirname + '/public/javascript/reminders_page');

var app = express();

app.set('port', (process.env.PORT || 5000));

app.use(express.static(__dirname + '/public'));

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');


app.get('/', function(request, response) {
  response.render('pages/index', medPage);
});
app.get('/med/new', function(request, response) {
  response.render('pages/new_med', scheduleMedPage);
});
app.get('/settings', function(request, response) {
  response.render('pages/settings', settingsPage);
});
app.get('/reminders', function(request, response) {
  response.render('pages/reminders', remindersPage);
});

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
