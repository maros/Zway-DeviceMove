# Zway-DeviceMove

Move devices like blinds or windows based on timing information to a selected 
position. 

Some devices cannot be set to a specific position, but only can be controlled
by moving the up or down. This module tries to circumvent this limitation by
creating a virtual device instead of the original device, that translates the
user-select position into timing information.

For example if a device usually takes 40 seconds to move from fully closed to
fully opened state, then moving the device to 50% requires sending the 
move-up command, followed by a stop command 20 seconds later.

# Configuration

## report

Usually these devices can correctly report certain states (either fully 
opened, or fully closed, but not both) to the controller. This selection
indicates which position is correctly reported.

## devices:

List of managed devices

## devices.device:

Device id

## devices.time:

Time it takes to move from fully closed to fully opened

# Events

No events are emitted

# Virtual Devices

This module creates a virtual device for each managed device. The original
device is hidden.

# License

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or any 
later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.
