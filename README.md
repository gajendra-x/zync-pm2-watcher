# Zync PM2 Watcher

Build a PM2 monitoring plugin for **Zync**.

Zync is an SSH/developer workspace application where developers can connect to remote servers and work with their terminal and other developer tools. This PM2 plugin will live inside the **Zync workspace pane**, alongside the developer's other workspace tools.

The goal of this plugin is to let a developer monitor and manage **PM2 processes running on the connected remote server** without having to manually run PM2 commands in the terminal.

## What the plugin should do

When the plugin is opened, it should retrieve and display the current PM2 state of the connected server.

The developer should be able to see:

* Whether PM2 is available/running
* Total number of managed processes
* Number of online processes
* Number of stopped processes
* Number of errored processes
* Process names
* PM2 IDs
* Process status
* Process mode
* PID
* Uptime
* Restart count
* CPU usage
* Memory usage
* Number of instances

## Process management

For every PM2 process, the developer should be able to perform the common PM2 operations:

* Start
* Restart
* Reload
* Stop
* Delete

Actions should execute against the connected remote server.

The UI should clearly communicate when an action is running and when it has completed or failed.

Destructive actions should require confirmation.

## Process details

When a developer selects a process, they should be able to inspect more information about that process, including:

* Process name
* PM2 ID
* PID
* Status
* Mode
* Instances
* Uptime
* Restart count
* CPU usage
* Memory usage
* Node version
* Script path
* Working directory
* Environment variables

## Logs

The developer should be able to open the logs for an individual PM2 process.

The log section should support:

* stdout
* stderr
* Live log output
* Searching logs
* Clearing the displayed logs
* Copying logs
* Following/auto-scrolling logs
* Expanding the log view when more space is available

Logs should behave like developer/server logs rather than static text.

## Monitoring

The plugin should periodically refresh process information so the developer can see changes in:

* CPU
* Memory
* Status
* Uptime
* Restart count

It should also provide a way to manually refresh the PM2 state.

For the prototype, use realistic mock PM2 data and simulate changing metrics where appropriate.

## Process filtering

The developer should be able to quickly find processes by:

* Process name
* PM2 ID
* Status

Provide filtering for states such as:

* All
* Online
* Stopped
* Errored

## Server states

Handle the following situations:

### PM2 available

Show the current PM2 processes and allow management.

### PM2 not installed

Tell the developer that PM2 is not available on the connected server and provide an appropriate action to install it.

### No PM2 processes

Show that PM2 is available but currently has no managed processes.

### SSH connection unavailable

Clearly indicate that the remote server is not currently accessible and that PM2 information cannot be retrieved.

### Loading

Handle the initial PM2 data retrieval without showing incomplete or misleading information.

### Command failure

If a PM2 command fails, show the failure and relevant error information to the developer.

## Zync workspace constraints

This is **not a standalone PM2 dashboard**.

The plugin will be embedded inside a Zync workspace pane, so it needs to work naturally within the available workspace area.

The available width can change depending on the user's Zync layout.

It must work well when:

* The workspace pane is wide
* The workspace pane is medium width
* The workspace pane is narrow

The plugin should adapt to the available space instead of assuming a fixed desktop dashboard width.

Do not depend on a full-screen layout.

The user should be able to monitor and manage PM2 processes without needing to leave the Zync workspace.

## Prototype

Build a complete interactive prototype using realistic mock data.

The prototype should demonstrate:

* PM2 process monitoring
* Process selection
* Process details
* Logs
* Filtering/search
* Start/restart/reload/stop/delete actions
* Loading states
* Error states
* Empty states
* Connection states
* Changing CPU/memory values
* Responsive behavior inside the Zync workspace pane

The implementation should be structured so that the mock PM2 data/actions can later be replaced by real SSH/PM2 commands from Zync.

Do not build a marketing page or standalone monitoring product.

Build the **actual PM2 workspace plugin experience** that can serve as a UI reference for implementing this feature inside Zync.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/719e1117-8ea1-42bf-a1ba-295499f4d2f3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
