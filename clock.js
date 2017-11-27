var CronJob = require('cron').CronJob;
const { spawn } = require('child_process');

var job = new CronJob({
  cronTime: '* * * * *',
  onTick: function() {
    sendReminders();
  },
  start: false,
  timeZone: 'America/Los_Angeles'
});

job.start();

function sendReminders() {
  var child = spawn('node', ['bin/sendReminders']);

  console.log(`started sendReminders - pid: ${child.pid}`);
  child.stdout.on('data', (data) => {
    console.log(`>>> ${data}`);
  });

  child.stderr.on('data', (data) => {
    console.log(`>>> ${data}`);
  });

  child.on('close', (code) => {
    console.log(`sendReminders:${child.pid} exited with code ${code}`);
  });
}
