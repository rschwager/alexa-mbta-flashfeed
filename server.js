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

var config = {
  saveThresholdInHours: 24,
  pollingIntervalInMinutes: 2,
  dbRetentionInHours: 48
}

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
    // GoMix implementation Note:
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
        type: Sequelize.INTEGER,
        primaryKey: true
      },
      updateDate: {
        type: Sequelize.DATE
      },
      lastSeenDate: {
        type: Sequelize.DATE
      },
      titleText: {
        type: Sequelize.TEXT
      },
      mainText: {
        type: Sequelize.TEXT
      },
      green: {
        type: Sequelize.BOOLEAN,
      },
      red: {
        type: Sequelize.BOOLEAN,
      },
      blue: {
        type: Sequelize.BOOLEAN,
      },
      orange: {
        type: Sequelize.BOOLEAN,
      },
      silver: {
        type: Sequelize.BOOLEAN,
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

function getLineInformation(anAlert) {
  var greenLine = anAlert.affected_services.services.some(x => (x.route_name && x.route_name.indexOf("Green Line") >= 0));
  var redLine = anAlert.affected_services.services.some(x => (x.route_name && x.route_name.indexOf("Red Line") >= 0));
  var blueLine = anAlert.affected_services.services.some(x => (x.route_name && x.route_name.indexOf("Blue Line") >= 0));
  var orangeLine = anAlert.affected_services.services.some(x => (x.route_name && x.route_name.indexOf("Orange Line") >= 0));
  var silverLine = anAlert.affected_services.services.some(x => (x.route_name && x.route_name.indexOf("Silver Line") >= 0));
  
  return {
    hasMatch: greenLine || redLine || blueLine || orangeLine || silverLine,
    green: greenLine,
    blue: blueLine,
    orange: orangeLine,
    red: redLine,
    silver: silverLine
  };
}

function isTimelyAlert(anAlert) {
  var alertDate = anAlert.last_modified_dt * 1000;
  var nowDate = new Date().getTime();
  var ageInMinutes = (nowDate - alertDate) / 1000 / 60;
  console.log("Alert Age: " + ageInMinutes + " minutes");
  return ageInMinutes <= 60 * config.saveThresholdInHours; // Alert has been modified in last day.
}

function eachAlert(anAlert) {
  if (isAccessibilityAlert(anAlert) || !isTimelyAlert(anAlert)) {
    return null;
  }
  
  var lineInfo = getLineInformation(anAlert);
  if (!lineInfo || !lineInfo.hasMatch)
    return null;
  
  var alertDate = new Date(anAlert.last_modified_dt * 1000);
  var nowDate = new Date();
  var newAlert = {
    "uid": anAlert.alert_id,
    "updateDate": alertDate.toJSON(),
    "lastSeenDate": nowDate.toJSON(),
    "titleText": "MBTA Service Update",
    "green": lineInfo.green,
    "red": lineInfo.red,
    "blue": lineInfo.blue,
    "silver": lineInfo.silver,
    "orange": lineInfo.orange,
    "mainText": anAlert.header_text
  };
  console.log(newAlert);
  
  Alert.upsert(newAlert);
  
  return newAlert; 
}

app.get("/:line", function(req, resp) {
  var retItems = [];
  var line = req.params.line;
  var now = new Date();
  
  // Bad Parameter.  Return a message saying such.
  if (line !== "green" && line !== "red" && line !== "blue" && line !== "orange" && line !== "silver") {
    resp.send({
            "uid": 1,
            "updateDate": now.toJSON(),
            "titleText": "MBTA Service Update",
            "mainText": "This feed has been configured incorrectly."
          });
    return;
  }
  
  // find multiple entries
  var options = {};
  options.where = {};
  options.where[line] = true;
  var d = new Date();
  d.setHours(d.getHours() - 2);
  options.where['lastSeenDate'] = { $gte: d }; 
  console.log(options);  
  Alert.findAll(options).then(function(alertItems) {
      line = line.charAt(0).toUpperCase() + line.substr(1).toLowerCase();

      // If no alerts, add an item that all is good
      if (!alertItems.length) {
        retItems.push(
          {
            "uid": 0,
            "updateDate": now.toJSON(),
            "titleText": line + " Line MBTA Service Update",
            "mainText": "All trains are running normally."
          });
      }
      else {
        alertItems.forEach(function(item) {
          var ageInMinutes = Math.round((now.getTime() - Date.parse(item.updateDate)) / 1000 / 60);          
          retItems.push(
            {
              "uid": item.uid,
              "updateDate": item.updateDate,
              "titleText": line + " Line " + item.titleText,
              "mainText": formatMainText(item, now)
            }
          );
        });
      }
      resp.send(retItems);
      return;
  });    
});

function formatMainText(alertItem, now) {
  var ageInMinutes = Math.round((now.getTime() - Date.parse(alertItem.updateDate)) / 1000 / 60);          
  var interval = ageInMinutes;
  var unit = "minutes";
  if (ageInMinutes > 60) {
    interval = Math.round(ageInMinutes / 60);
    unit = interval == 1 ? "hour" : "hours";
  }
  else if (ageInMinutes > 60 * 24) {
    interval = Math.round(ageInMinutes / 60 / 24);
    unit = interval == 1 ? "day" : "days";
  }
  return "Updated " + interval + " " + unit + " ago, " + alertItem.mainText
}

// Get Alerts from MBTA and save them to storage
function getAlertsFromMBTA() {
  if (!Alert)
    return;

  // Delete alerts older than a threshold since we don't need them any more.
  var d = new Date();
  d.setHours(d.getHours() - config.dbRetentionInHours);
  Alert.destroy({
    where: {
      updateDate: {
        $lte: d
      } 
    }
  });
  
  // Get alerts from MBTA
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
setInterval(getAlertsFromMBTA, 1000 * 60 * config.pollingIntervalInMinutes); // Every x minutes

// listen for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});
