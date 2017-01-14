// server.js
// where your node app starts

// init project
var express = require('express');
var app = express();

app.use(express.static('public'));

var request = require('request');

// TODO -- Clean above
// TODO -- Get my own key to mbta and switch from public one.

var params = {
  qs: {
    api_key: "wX9NwuHnZU2ToO7GmGR9uw"
  },
  url: 'http://realtime.mbta.com/developer/api/v2/alerts',
  json: true
};

function isAccessibilityAlert(anAlert) {
  var headerText = anAlert.header_text;
  return /elevator/.test(headerText.toLowerCase()) || /escalator/.test(headerText.toLowerCase());
}

function isGreenLine(anAlert) {
  return anAlert.affected_services.services.some(x => (x.route_name && x.route_name.indexOf("Green Line") >= 0));
  
  
}

function eachAlert(anAlert) {
  if (isAccessibilityAlert(anAlert) || !isGreenLine(anAlert)) {
    return null;
  }
  
  return {
    "uid": anAlert.alert_id,
    "updateDate": "2016-05-23T22:34:51.0Z",
    "titleText": "Green Line MBTA Service Update",
    "mainText": anAlert.header_text
  };
}

app.get("/", function(req, resp) {
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
  
      // If no alerts, add an item that all is good
      if (!alertItems.length) {
        alertItems.push(
          {
            "uid": 0,
            "updateDate": "2016-05-23T22:34:51.0Z",
            "titleText": "Green Line MBTA Service Update",
            "mainText": "All trains are running normally."
          });
      }
      resp.send(alertItems);
      return;
    }
  });
});

// listen for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});
