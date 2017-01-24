// server.js
// where your node app starts

// init project
var request = require('request');
var Sequelize = require('sequelize');
var express = require('express');
var app = express();

app.use(express.static('public'));

var params = {
  qs: {
    api_key: "hDT9Pj7DkE-onZX3MOzO9g"
  },
  url: 'http://realtime.mbta.com/developer/api/v2/alerts',
  json: true
};

// setup a new database
// using database credentials set in .env
var sequelize = new Sequelize('database', process.env.DB_USER, process.env.DB_PASS, {
  host: '0.0.0.0',
  dialect: 'sqlite',
  pool: {
    max: 5,
    min: 0,
    idle: 10000
  },
    // Security note: the database is saved to the file `database.sqlite` on the local filesystem. It's deliberately placed in the `.data` directory
    // which doesn't get copied if someone remixes the project.
  storage: '.data/database.sqlite'
});

// authenticate with the database
var Alert;
sequelize.authenticate()
  .then(function(err) {
    console.log('Connection has been established successfully.');
    // define a new table 'alerts'
    Alert = sequelize.define('alerts', {
      uid: {
        type: Sequelize.INTEGER
      },
      updateDate: {
        type: Sequelize.DATE
      },
      titleText: {
        type: Sequelize.TEXT
      },
      mainText: {
        type: Sequelize.TEXT
      }
    });
    
    setup();
  })
  .catch(function (err) {
    console.log('Unable to connect to the database: ', err);
  });

// populate table with default users
function setup(){
  Alert.sync({force: false});  
}


function isAccessibilityAlert(anAlert) {
  var headerText = anAlert.header_text;
  return /elevator/.test(headerText.toLowerCase()) || /escalator/.test(headerText.toLowerCase());
}

function isGreenLine(anAlert) {
  return anAlert.affected_services.services.some(x => (x.route_name && x.route_name.indexOf("Green Line") >= 0));
}

function isTimelyAlert(anAlert) {
  var alertDate = anAlert.last_modified_dt * 1000;
  var nowDate = new Date().getTime();
  console.log(nowDate - alertDate);
  return true; //nowDate - alertDate <= 60 * 60 * 24; // Alert has been modified in last day.
}

function eachAlert(anAlert) {
  if (isAccessibilityAlert(anAlert) || !isGreenLine(anAlert) || !isTimelyAlert(anAlert)) {
    return null;
  }
  
  var alertDate = new Date(anAlert.last_modified_dt * 1000);
  var newAlert = {
    "uid": anAlert.alert_id,
    "updateDate": alertDate.toJSON(),
    "titleText": "Green Line MBTA Service Update",
    "mainText": anAlert.header_text
  };
  console.log(newAlert);
  
  Alert.findOrCreate({where: {uid: anAlert.alert_id}, defaults: newAlert});
  
  return newAlert; 
}

app.get("/", function(req, resp) {
  var retItems = [];
  
  // find multiple entries
  Alert.findAll().then(function(alertItems) {
      // If no alerts, add an item that all is good
      if (!alertItems.length) {
        var now = new Date();
        retItems.push(
          {
            "uid": 0,
            "updateDate": now.toJSON(),
            "titleText": "Green Line MBTA Service Update",
            "mainText": "All trains are running normally."
          });
      }
      else {
        alertItems.forEach(function(item) {
          // TODO, add time context to main text
          retItems.push(
            {
              "uid": item.uid,
              "updateDate": item.updateDate,
              "titleText": item.titleText,
              "mainText": item.mainText
            }
          );
        });
      }
      resp.send(retItems);
      return;
  });    
});

// Get Alerts from MBTA and save them to storage
function getAlertsFromMBTA() {
  if (!Alert)
    return;

  // Delete alerts older than a threshold since we don't need them any more.
  var d = new Date();
  d.setHours(d.getHours() - 6);
  Alert.destroy({
    where: {
      updateDate: {
        $lte: d
      } 
    }
  });
  
  // Get alerts from MBTA
    // Get new Alerts from the MBTA
  request(params, function(err, r, body) {
    var alertItems = [];
    if (err) {
      console.log(err.stack);
      console.log(err);
    } 
    else if (body && body.alerts) {
      body.alerts.forEach(function(anAlert) {
        var alertResp = eachAlert(anAlert);
        if (alertResp)
           alertItems.push(alertResp);
      });
    }
    console.log("Found " + alertItems.length + " alerts");
  });
}

// Set the polling interval.
getAlertsFromMBTA();
setInterval(getAlertsFromMBTA, 1000 * 60 * 2); // Every x minutes

// listen for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});
