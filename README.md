MBTA Alerts to Alexa Flash Report format
=========================

I bought an Amazon Alexa and wanted to play with adding skills to it.

In reading the documentation, the flash report was a nice and quick way to do it.  I created a skill on the alexa for reading out alerts on the MBTA.  This project calls the alert api from the MBTA and converts the alerts into the format that Amazon Alexa uses.  It's basically a simple transformer with a DB cache (using sqlite).

Enjoy and modify as you see fit.

[Running on Gomix](https://shaky-rake.gomix.me/)


