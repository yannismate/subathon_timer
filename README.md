# Subathon Timer
Configurable Twitch Subathon Timer with integrated wheel of fortune

## Getting Started
### Dependencies
* [Node.js 16+](https://nodejs.org/en/)

### Installation
* Clone or download this repository
* Install all dependencies with `npm i`

### Configuration
#### Configuration file
Before starting the program a configuration file with the name `config.json` has to be
created in the base directory. You can simply make a copy of the `config.example.json` and rename it.

|Configuration option|Details|
|---|---|
|port|Port for the integrated webserver|
|channel|Twitch channel the timer will listen to events on|
|admins|Twitch users that will have access to commands|
|wheel_blacklist|List of Twitch users that cannot be timed out by the wheel timeout option|
|twitch_token|Twitch OAuth token to execute timeouts from ([obtain here](https://twitchapps.com/tmi/))|
|use_streamlabs|Enable streamlabs connection for donations|
|streamlabs_token|Streamlabs Socket Token used to connect to Streamlabs|
|enable_wheel|Enable wheel of fortune|
|time||
|time.base_value|Base value used to calculate all other values|
|time.multipliers||
|time.multipliers.tier_1|Multiplier for Tier 1 or Prime subs|
|time.multipliers.tier_2|Multiplier for Tier 2 subs|
|time.multipliers.tier_3|Multiplier for Tier 3 subs|
|time.multipliers.donation|Multiplier for donations per $1|
|time.multipliers.bits|Multiplier for bits per 100 bits|
|wheel||
|wheel[].type|Wheel spin type (`time`,`timeout`)|
|wheel[].value|Value for timeout or time in seconds|
|wheel[].chance|Weight for this specific result|
|wheel[].text|Result Text shown on the timer|
|wheel[].min_subs|Minimum amount of subs in the sub-bomb to include this option|
|wheel[].color|CSS color of this result on the wheel|
|wheel[].target|Timeout target (`sender`, `random`)|


#### Assets
The background and graph end image can be replaced before starting the program by replacing 
the files in public/assets with your own assets.

### Usage
* To reset the program after previous usage delete the data.db file
* Start the program using `npm run start`
* Use the outputted URL in your browser or OBS browser source

#### Commands
* `?start [hh:mm:ss]` (when not started) Start the timer with the given timer value and set the uptime to 0
* `?forcetimer [hh:mm:ss]` (when running) Update the timers value
* `?setbasetime [seconds]` Update the base time

# License
This project is licensed under the GNU General Public License v3.0 License - see the LICENSE file for details