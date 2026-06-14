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

| Configuration option        | Details                                                                                                                                 |
|-----------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| port                        | Port for the integrated webserver                                                                                                       |
| channel                     | Twitch channel the timer will listen to events on                                                                                       |
| admins                      | Twitch users that will have access to commands                                                                                          |
| wheel_blacklist             | List of Twitch users that cannot be timed out by the wheel timeout option                                                               |
| twitch_client_id            | Client ID for Twitch API calls (use `elwoogfl7prmozj77tbw1g7jparem5` or create your own App)                                            |
| twitch_user_id              | Twitch User ID of the used account ([obtain here](https://www.streamweasels.com/tools/convert-twitch-username-%20to-user-id/))          |
| twitch_channel_id           | Twitch User ID of the target channel ([obtain here](https://www.streamweasels.com/tools/convert-twitch-username-%20to-user-id/))        |
| use_streamlabs              | Enable streamlabs connection for donations                                                                                              |
| streamlabs_token            | Streamlabs Socket Token used to connect to Streamlabs                                                                                   |
| use_streamelements          | Enable streamelements connection for donations                                                                                          |
| streamelements_token        | Streamelements JWT Token used to connect to Streamelements ([obtain here](https://streamelements.com/dashboard/account/channels))       |
| enable_wheel                | Enable wheel of fortune                                                                                                                 |
| time                        |                                                                                                                                         |
| time.base_value             | Base value used to calculate all other values                                                                                           |
| time.multipliers            |                                                                                                                                         |
| time.multipliers.tier_1     | Multiplier for Tier 1 or Prime subs                                                                                                     |
| time.multipliers.tier_2     | Multiplier for Tier 2 subs                                                                                                              |
| time.multipliers.tier_3     | Multiplier for Tier 3 subs                                                                                                              |
| time.multipliers.donation   | Multiplier for donations per $1                                                                                                         |
| time.multipliers.bits       | Multiplier for bits per 100 bits                                                                                                        |
| wheel                       |                                                                                                                                         |
| wheel[].type                | Wheel spin type (`time`,`timeout`)                                                                                                      |
| wheel[].value               | Value for timeout or time in seconds                                                                                                    |
| wheel[].chance              | Weight for this specific result                                                                                                         |
| wheel[].text                | Result Text shown on the timer                                                                                                          |
| wheel[].color               | CSS color of this result on the wheel                                                                                                   |
| wheel[].target              | Timeout target (`sender`, `random`)                                                                                                     |
| wheel[].conditions          | Conditions for wheel option to be present. Optional entries for "gifts", "donation" and "modes" (see below)                             |
| wheel[].conditions.gifts    | Conditions for wheel option to be present on gifted subs. Will not trigger on gifts if not present. Optional "min" and "max" options.   |
| wheel[].conditions.donation | Conditions for wheel option to be present on donations. Will not trigger on donations if not present. Optional "min" and "max" options. |
| wheel[].conditions.modes    | Conditions for wheel modes where option is present. Default is \["default"\].                                                           |


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
* `?wheelmode [mode]` Update the wheel mode for filtering options

# License
This project is licensed under the GNU General Public License v3.0 License - see the LICENSE file for details