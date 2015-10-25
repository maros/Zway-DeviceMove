# Zway-DeviceMove

Move devices like blinds or windows based on timing information to a selected 
position. 

Some devices cannot be set to a specific position, but only can be controlled
by moving them up or down. This module tries to circumvent this limitation by
creating a virtual multilevel Switch device instead of the original device, 
that translates the user-select position into timing information.

For example if a device usually takes 40 seconds to move from fully closed to
fully opened state, then moving the device to 50% requires sending the 
move-up command, followed by a stop command 20 seconds later.

Furthermore this virtual device can check related devices. When two automation
devices operate on the same physical object (eg. blind and window chain drive)
, and interfere witch each other then checking for related devices ensures 
proper functionality and prevents damage.

# Configuration

## report

Usually these devices can correctly report certain states (either fully 
opened, or fully closed, but not both) to the controller. This selection
indicates which position is correctly reported.

## devices

List of managed devices

## devices.device

Device id

## devices.time

Time it takes to move from fully closed to fully opened

## devices.relatedDevice

Related device. See relatedCheck for detailed explanation.

## icon

Select which icon to use for the virtual device. Default (taken from the 
parent device), blinds, windows and dimmer icons are available.

## report

Indicates at which position correct device positioning is reported. 
Eg. A blind only reports 0% when fully closed, or 100% when partially or fully
opened. In this case the report setting needs to be set to report-'close', 
because only the fully closed state is reported exactly.

## relatedCheck

Enables checks for related devices. When two automation devices operate
on the same physical object, and interfere witch each other then checking
for related devices ensures proper functionality and prevents damage.
Eg. Closing a blind is not possible when the window was opened by a chain
drive. On the other hand windows should not be opened more than 20% with
closed blinds. This check is able to limit the movement of the managed devices
accordingly.

## relatedDeviceLimit, relatedDeviceComparison

Checks if the related device is above or below a certain limit. If
relatedDeviceLimit and relatedDeviceComparison match then the current device
is limited by the deviceLimit

## deviceLimit

Defines a limit for the current device if the related device position is 
within a certain limit.

# Events

No events are emitted

# Virtual Devices

This module creates a virtual device for each managed device. The original
device is hidden.

# Installation

```shell
cd /opt/z-way-server/automation/modules
git clone https://github.com/maros/Zway-DeviceMove.git DeviceMove --branch latest
```

To update or install a specific version
```shell
cd /opt/z-way-server/automation/modules/DeviceMove
git fetch --tags
# For latest released version
git checkout tags/latest
# For a specific version
git checkout tags/1.02
# For development version
git checkout -b master --track origin/master
```

# License

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or any 
later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.
