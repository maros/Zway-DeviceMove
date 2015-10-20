/*** DeviceMove Z-Way HA module *******************************************

Version: 1.00
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: maros@k-1.com <maros@k-1.com>
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
        if (realDevice == null) {
            console.error('[DevceMove] Device not found '+deviceId);
            return;
        }
        var deviceIcon  = icon
        var probeTitle  = icon;
        var title       = realDevice.get('metrics:title');
        if (icon === 'default') {
            deviceIcon  = realDevice.get('metrics:icon');
            probeTitle  = realDevice.get('metrics:probeTitle');
        }
        
        title = title.replace(/\s*\[raw\]\s*/,"");
        
        // Hide and rename device
        realDevice.set('metrics:title',title+' [raw]');
        realDevice.set('permanently_hidden',true);
        realDevice.set('visibility',false);
        
        // Create virtual device
        var virtualDevice = this.controller.devices.create({
            deviceId: "DeviceMove_" + self.id+'_'+deviceId,
            defaults: {
                deviceType: 'switchMultilevel',
                metrics: {
                    probeTitle: probeTitle,
                    probeType: 'blind',
                    title: title,
                    icon: deviceIcon,
                    level: null
                }
            },
            overlay: {
                location: realDevice.get('location'),
                tags: realDevice.get('tags'),
                deviceType: 'switchMultilevel'
            },
            handler: function(command,args) {
                if (command === 'update') {
                    return;
                }
                var currentLevel = this.get('metrics:level');
                var newLevel;
                if (command === 'on' || command === 'up' || command === 'startUp') {
                    newLevel = 99;
                } else if (command === 'off'|| command === 'down' || command === 'startDown') {
                    newLevel = 0;
                } else if ("exact" === command || "exactSmooth" === command) {
                    newLevel = args.level;
                } else if ("increase" === command) {
                    newLevel = currentLevel + 10;
                } else if ("decrease" === command) {
                    newLevel = currentLevel - 10;
                }
                console.log('[DeviceMove] Got command '+command+' for '+deviceId+': Set to '+newLevel);
                
                self.delay.replace(
                    deviceId,
                    self.moveDevice,
                    1000*2,
                    deviceId,
                    newLevel
                );
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
        if (realDevice == null) {
            return;
        }
        var virtualDevice = self.controller.devices.get(self.virtualDevices[deviceId]);
        
        var title       = realDevice.get('metrics:title');
        title = title.replace(/\s*\[raw\]\s*/,"");
        realDevice.set('metrics:title',title);
        realDevice.set('permanently_hidden',false);
        realDevice.set('visibility',true);
        
        if (typeof(virtualDevice) !== 'undefined') {
            self.controller.devices.remove(virtualDevice);
        }
        
        if (typeof(realDevice) !== 'undefined') {
            device.off('change:metrics:level',self.callbacks[deviceId]);
        }
    });
    
    if (typeof(self.timer) !== 'undefined') {
        clearTimeout(self.timer);
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
    level               = parseInt(level);
    
    if (level > 99) {
        level = 99;
    }
    
    // Set virtual device
    virtualDevice.set('metrics:level',level);
    if (self.config.icon === 'window') {
        var status
        if (level === 0) {
            status = 'down';
        } else if (level >= 99) {
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
    var realDevice      = self.controller.devices.get(deviceId);
    var deviceEntry     = _.find(self.config.devices,function(deviceEntry) { return deviceEntry.device === deviceId; });
    if (typeof(deviceEntry) === 'undefined') {
        return;
    }
    var deviceTime      = parseInt(deviceEntry.time);
    var stepTime        = deviceTime / 100;
    var moveCommand     = undefined;
    var newLevel        = parseInt(level);
    
    // Check related devices
    if (self.config.relatedCheck
        && typeof(deviceEntry.relatedDevice) !== undefined) {
        var relatedDevice   = self.controller.devices.get(deviceEntry.relatedDevice);
        if (relatedDevice == null) {
            console.error('[DevceMove] Related device not found '+deviceEntry.relatedDevice);
        } else {
            var relatedLevel    = relatedDevice.get('metrics:level');
            if (self.config.relatedDeviceComparison === 'gt'
                && relatedLevel > self.config.relatedDeviceLimit) {
                newLevel = Math.min(newLevel,self.config.deviceLimit);
            } else if (self.config.relatedDeviceComparison === 'lt'
                && relatedLevel < self.config.relatedDeviceLimit) {
                newLevel = Math.max(newLevel,self.config.deviceLimit);
            }
        }
    }
    
    if (newLevel >= 99) {
        moveCommand = 'on';
        newLevel = 99;
        self.lock.add(
            deviceId,
            self.checkDevice,
            (deviceTime*2*1000),
            deviceId
        );
        realDevice.set('metrics:level',254);
    } else if (newLevel <= 0) {
        moveCommand = 'off';
        newLevel = 0;
        self.lock.add(
            deviceId,
            self.checkDevice,
            (deviceTime*2*1000),
            deviceId
        );
        realDevice.set('metrics:level',0);
    } else {
        var diffLevel = Math.abs(oldLevel - newLevel);
        if (diffLevel <= 5) {
            return;
        }
        var diffTime    = stepTime * diffLevel;
        moveCommand     = (oldLevel > newLevel) ? 'startDown':'startUp';
        diffLevel       = Math.abs(diffTime / stepTime);
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
    var device      = self.controller.devices.get(deviceId);
    self.lock.add(
        deviceId,
        self.checkDevice,
        (5*1000),
        deviceId
    );
    device.performCommand("stop");
};

DeviceMove.prototype.pollDevices = function() {
    var self = this;
    _.each(self.config.devices,function(deviceEntry) {
        self.pollDevice(deviceEntry.device);
    });
};

DeviceMove.prototype.pollDevice = function(deviceId) {
    var self = this;
    
    var pollInterval    = 10*60*1000;
    var currentTime     = Math.floor(new Date().getTime() / 1000);
    var device          =  self.controller.devices.get(deviceId);
    var updateTime      = device.get('updateTime');
    if ((updateTime + pollInterval) < currentTime) {
        device.performCommand("update");
    }
};

DeviceMove.prototype.checkDevice = function(deviceId,args) {
    var self            = this;
    
    if (self.lock.running(deviceId)) {
        return;
    }
    
    var realDevice      = self.controller.devices.get(deviceId);
    var virtualDevice   = self.virtualDevices[deviceId];
    var realLevel       = parseInt(realDevice.get('metrics:level'));
    var virtualLevel    = parseInt(virtualDevice.get('metrics:level'));
    var setLevel        = undefined;
    
    // Detect full open
    if (self.config.report === 'open' && realLevel >= 99) {
        self.setStatus(deviceId,99);
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

 
