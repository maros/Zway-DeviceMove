/*** DeviceMove Z-Way HA module *******************************************

Version: 1.02
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: Maroš Kollár <maros@k-1.com>
Description:
    Move devices to specified position based on timing information

******************************************************************************/

function DeviceMove (id, controller) {
    // Call superconstructor first (AutomationModule)
    DeviceMove.super_.call(this, id, controller);
    
    this.virtualDevices = {};
    this.callbacks      = {};
    this.delay          = undefined;
    this.lock           = undefined;
    this.timer          = undefined;
}

inherits(DeviceMove, AutomationModule);

_module = DeviceMove;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

DeviceMove.prototype.init = function (config) {
    DeviceMove.super_.prototype.init.call(this, config);
    var self = this;
    
    executeFile("modules/DeviceMove/timeout.js");
    
    self.delay          = new TimeoutManager(self);
    self.lock           = new TimeoutManager(self);
    self.timer          = setInterval(
        _.bind(self.pollDevices,self), 
        (15*60*1000)
    );
    
    setTimeout(_.bind(self.initCallback,self),10000);
};

DeviceMove.prototype.initCallback = function() {
    var self = this;
    
    var icon = self.config.icon;
    
    _.each(self.config.devices,function(deviceEntry) {
        var deviceId    = deviceEntry.device;
        var realDevice  = self.controller.devices.get(deviceId);
        if (realDevice === null) {
            console.error('[DevceMove] Device not found '+deviceId);
            return;
        }
        var deviceIcon  = icon;
        var probeType   = realDevice.get('probeType');
        var title       = realDevice.get('metrics:title');
        if (icon === 'default') {
            deviceIcon  = realDevice.get('metrics:icon');
        } else if (icon === 'blind') {
            deviceIcon = 'blinds';
        }
        
        title = title.replace(/\s*\[raw\]\s*/,"");
        
        // Hide and rename device
        realDevice.set('metrics:title',title+' [raw]');
        //realDevice.set('permanently_hidden',true);
        realDevice.set({'visibility': false});

        // Create virtual device
        var virtualDevice = this.controller.devices.create({
            deviceId: "DeviceMove_" + self.id+'_'+deviceId,
            defaults: {
                metrics: {
                    title: title,
                    level: null
                }
            },
            overlay: {
                deviceType: 'switchMultilevel',
                probeType: probeType,
                tags: realDevice.get('tags'),
                location: realDevice.get('location'),
                metrics: {
                    icon: deviceIcon
                }
            },
            handler: function(command,args) {
                if (command === 'update') {
                    self.pollDevice(deviceId);
                    return;
                }
                var currentLevel = this.get('metrics:level');
                var newLevel;
                var delay = false;
                if (command === 'on' || command === 'up' || command === 'startUp' || command === 'upMax') {
                    newLevel = 255;
                } else if (command === 'off'|| command === 'down' || command === 'startDown') {
                    newLevel = 0;
                } else if ("exact" === command || "exactSmooth" === command) {
                    newLevel = args.level;
                    delay = true;
                } else if ("increase" === command) {
                    newLevel = currentLevel + 10;
                } else if ("decrease" === command) {
                    newLevel = currentLevel - 10;
                }
                console.log('[DeviceMove] Got command '+command+' for '+deviceId+': Set from '+currentLevel+' to '+newLevel);
                if (delay) {
                    self.delay.replace(
                        deviceId,
                        self.moveDevice,
                        1000*2.5,
                        deviceId,
                        newLevel
                    );
                } else {
                    self.moveDevice(deviceId,newLevel);
                }
            },
            moduleId: self.id
        });
        
        self.virtualDevices[deviceId] = virtualDevice;
        
        // Build, register and call check callback
        var callback = _.bind(self.checkDevice,self,deviceId);
        realDevice.on('change:metrics:level',callback);
        callback();
        self.callbacks[deviceId] = callback;
    });
};

DeviceMove.prototype.stop = function() {
    var self = this;
    
    DeviceMove.super_.prototype.stop.call(this);
    
    // Remove device & callbacks
    _.each(self.config.devices,function(deviceId){
        var realDevice  = self.controller.devices.get(deviceId);
        if (realDevice === null) {
            return;
        }
        var virtualDevice = self.controller.devices.get(self.virtualDevices[deviceId]);
        
        var title       = realDevice.get('metrics:title');
        title = title.replace(/\s*\[raw\]\s*/,"");
        realDevice.set('metrics:title',title);
        realDevice.set({'visibility': true});
        
        if (virtualDevice !== null) {
            self.controller.devices.remove(virtualDevice);
        }
        
        if (virtualDevice !== null) {
            realDevice.off('change:metrics:level',self.callbacks[deviceId]);
        }
    });
    
    if (typeof(self.timer) !== 'undefined') {
        clearInterval(self.timer);
    }
    
    self.delay.clearAll();
    self.lock.clearAll();
    
    self.timer          = undefined;
    self.delay          = undefined;
    self.lock           = undefined;
    self.virtualDevices = {};
    self.callbacks      = {};
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

DeviceMove.prototype.setStatus = function(deviceId,level) {
    var self            = this;
    var virtualDevice   = self.virtualDevices[deviceId];
    level               = parseInt(level,10);
    
    if (level > 99) {
        level = 255;
    }
    
    // Set virtual device
    virtualDevice.set('metrics:level',level);
    if (self.config.icon === 'window') {
        var status;
        if (level === 0) {
            status = 'down';
        } else if (level === 255) {
            status = 'up';
        } else {
            status = 'half';
        }
        virtualDevice.set('metrics:icon',"/ZAutomation/api/v1/load/modulemedia/DeviceMove/window-"+status+".png");
    }
};

DeviceMove.prototype.moveDevice = function(deviceId,level) {
    var self            = this;
    
    // Check if already running
    if (self.lock.running(deviceId)) {
        self.delay.replace(
            deviceId,
            self.moveDevice,
            (1000*15),
            deviceId,
            level
        );
        return;
    }
    
    var virtualDevice   = self.virtualDevices[deviceId];
    var oldLevel        = virtualDevice.get('metrics:level');
    if (oldLevel >= 99) {
        oldLevel = 100;
    }
    var realDevice      = self.controller.devices.get(deviceId);
    var deviceEntry     = _.find(self.config.devices,function(deviceEntry) { return deviceEntry.device === deviceId; });
    if (deviceEntry === null) {
        return;
    }
    var moveCommand;
    var newLevel        = parseInt(level,10);
    var maxTime         = Math.max(deviceEntry.timeUp,deviceEntry.timeDown);
    
    // Check related devices
    if (self.config.relatedCheck
        && typeof(deviceEntry.relatedDevice) !== undefined) {
        var relatedDevice = self.controller.devices.get(deviceEntry.relatedDevice);
        if (relatedDevice === null) {
            console.error('[DevceMove] Related device not found '+deviceEntry.relatedDevice);
        } else {
            var relatedLevel = relatedDevice.get('metrics:level');
            if (typeof(relatedLevel) === 'string'
                && relatedLevel === 'on') {
                relatedLevel = 1;
            } else if (typeof(relatedLevel) === 'string'
                && relatedLevel === 'off') {
                relatedLevel = 0;
            } else {
                relatedLevel = parseInt(relatedLevel,10);
            }
            if (self.config.relatedDeviceComparison === 'gt'
                && relatedLevel >= self.config.relatedDeviceLimit) {
            if (relatedLevel >= 99) {
                relatedLevel = 100;
            }
                newLevel = Math.min(newLevel,self.config.deviceLimit);
            } else if (self.config.relatedDeviceComparison === 'lt'
                && relatedLevel <= self.config.relatedDeviceLimit) {
                newLevel = Math.max(newLevel,self.config.deviceLimit);
            }
        }
    }
    
    if (newLevel >= 99) {
        moveCommand = 'on';
        newLevel = 255;
        self.lock.add(
            deviceId,
            self.pollDevice,
            (maxTime*2*1000),
            deviceId
        );
        realDevice.set('metrics:level',255);
    } else if (newLevel <= 0) {
        moveCommand = 'off';
        newLevel = 0;
        self.lock.add(
            deviceId,
            self.pollDevice,
            (maxTime*2*1000),
            deviceId
        );
        realDevice.set('metrics:level',0);
    } else {
        var diffLevel = Math.abs(oldLevel - newLevel);
        if (diffLevel <= 10) {
            return;
        }
        var deviceTime  = parseInt(deviceEntry[(oldLevel > newLevel) ? 'timeDown':'timeUp'],10);
        var stepTime    = deviceTime / 100;
        var diffTime    = stepTime * diffLevel;
        diffLevel       = Math.abs(diffTime / stepTime);
        moveCommand     = (oldLevel > newLevel) ? 'startDown':'startUp';
        newLevel        = (oldLevel < newLevel) ? oldLevel + diffLevel : oldLevel - diffLevel;
        self.lock.add(
            deviceId,
            self.stopDevice,
            (diffTime * 1000),
            deviceId
        );
        
        console.log('[DeviceMove] Move device '+deviceId+' from '+oldLevel+' to '+newLevel+' for '+diffTime+' seconds');
    }
    
    realDevice.performCommand(moveCommand);
    
    // Set status
    virtualDevice.set('metrics:level',newLevel);
    
    self.setStatus(deviceId,newLevel);
};

DeviceMove.prototype.stopDevice = function(deviceId) {
    var self        = this;
    var deviceObject      = self.controller.devices.get(deviceId);
    self.lock.add(
        deviceId,
        self.checkDevice,
        (5*1000),
        deviceId
    );
    deviceObject.performCommand("stop");
    deviceObject.performCommand("update");
    //self.pollDevice(deviceId);
};

DeviceMove.prototype.pollDevices = function() {
    var self = this;
    console.log('[DeviceMove] Polling devices');
    _.each(self.config.devices,function(deviceEntry) {
        self.pollDevice(deviceEntry.device);
    });
};

DeviceMove.prototype.pollDevice = function(deviceId) {
    var self = this;
    
    var pollInterval    = 10*60*1000;
    var currentTime     = Math.floor(new Date().getTime() / 1000);
    var deviceObject    = self.controller.devices.get(deviceId);
    if (deviceObject === null) {
        return;
    }
    var updateTime      = deviceObject.get('updateTime');
    if ((updateTime + pollInterval) < currentTime) {
        deviceObject.performCommand("update");
    }
};

DeviceMove.prototype.checkDevice = function(deviceId,args) {
    var self            = this;
    
    if (self.lock.running(deviceId)) {
        return;
    }
    
    var realDevice      = self.controller.devices.get(deviceId);
    var virtualDevice   = self.virtualDevices[deviceId];
    var realLevel       = parseInt(realDevice.get('metrics:level'),10);
    var virtualLevel    = parseInt(virtualDevice.get('metrics:level'),10);
    var setLevel;
    
    // Detect full open
    if (self.config.report === 'open' && realLevel === 255) {
        self.setStatus(deviceId,255);
    // Detect full close
    } else if (self.config.report === 'close' && realLevel === 0) {
        self.setStatus(deviceId,0);
    // Init empty slot
    } else if (isNaN(virtualLevel)) {
        self.setStatus(deviceId,realLevel);
    // Correct partial open
    } else if (self.config.report === 'close' && realLevel > 0 && virtualLevel === 0) {
        console.log('[DeviceMove] Detected status mismatch for '+deviceId+'. Now closed');
        self.setStatus(deviceId,realLevel);
    // Correct partial close
    } else if (self.config.report === 'open' && realLevel === 0 && virtualLevel >= 99) {
        console.log('[DeviceMove] Detected status mismatch for '+deviceId+'. Now opened');
        self.setStatus(deviceId,realLevel);
    }
    
    // Set update time
    virtualDevice.set('updateTime',realDevice.get('updateTime'));
};

 
