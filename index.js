/*** DeviceMove Z-Way HA module *******************************************

Version: 1.0.0
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: maros@k-1.com <maros@k-1.com>
Description:
    Move devices to specified position based on timing information

******************************************************************************/

function DeviceMove (id, controller) {
    // Call superconstructor first (AutomationModule)
    DeviceMove.super_.call(this, id, controller);
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
    
    self.virtualDevices = {};
    self.callbacks      = {};
    self.delay          = new TimeoutManager(self);
    self.lock           = new TimeoutManager(self);
    self.statusId       = "DeviceMove_" + self.id;
    self.status         = loadObject(self.statusId) || {};
    self.timer          = setInterval(
        _.bind(self.pollDevices,self), 
        15*60*1000
    );
    
    setTimeout(_.bind(self.initCallback,self),10000);
};

DeviceMove.prototype.initCallback = function() {
    var self = this;
    
    var icon = self.config.icon;
    
    _.each(self.config.devices,function(deviceEntry) {
        var deviceId    = deviceEntry.device;
        var realDevice  = self.controller.devices.get(deviceId);
        var deviceIcon  = icon
        var probeTitle  = icon;
        if (icon === 'default') {
            deviceIcon  = realDevice.get('metrics:icon');
            probeTitle  = realDevice.get('metrics:probeTitle');
        }
        
        // Create virtual device
        var virtualDevice = this.controller.devices.create({
            deviceId: "DeviceMove_" + self.id+'_'+deviceId,
            defaults: {
                deviceType: 'switchMultilevel',
                metrics: {
                    probeTitle: probeTitle,
                    title: realDevice.get('metrics:title')+"VIRT",
                    icon: deviceIcon
                }
            },
            overlay: {
                location: realDevice.get('location'),
                tags: realDevice.get('tags'),
                deviceType: 'switchMultilevel'
            },
            handler: function(command,args) {
                //console.log('>>> COMMAND:'+command);
                if (command === 'update') {
                    return;
                }
                var level;
                if (command === 'on' || command === 'up' || command === 'startUp') {
                    level = 99;
                } else if (command === 'off'|| command === 'down' || command === 'startDown') {
                    level = 0;
                } else if ("exact" === command || "exactSmooth" === command) {
                    level = args.level;
                } else if ("increase" === command) {
                    level = self.status[deviceId];
                    level = level + 10;
                } else if ("decrease" === command) {
                    level = self.status[deviceId];
                    level = level - 10;
                }
                // TODO: Handle stop
                
                self.delay.replace(
                    deviceId,
                    self.moveDevice,
                    1000*2,
                    deviceId,
                    level
                );
            },
            moduleId: self.id
        });
        
        self.virtualDevices[deviceId] = virtualDevice;
        
        // Hide real device
        // realDevice.set('visibility',false);
        
        // Init level from storage
        if (typeof(self.status[deviceId]) !== 'undefined') {
            self.setStatus(deviceId,self.status[deviceId]);
        }
        
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
    
    // Remove device
    _.each(self.virtualDevices,function(deviceId,deviceObject){
        self.controller.devices.remove(deviceObject);
    });
    
    // Remove callbacks
    _.each(self.callbacks,function(deviceId,callbackFunction) {
        var device = self.controller.devices.get(deviceId);
        if (typeof(device) !== 'undefined') {
            device.off('change:metrics:level',callbackFunction);
        }
    });
    
    self.delay.clearAll();
    self.lock.clearAll();
    
    self.delay = undefined;
    self.virtualDevices = {};
    self.callbacks = {};
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
    
    // Save status
    if (self.status[deviceId] !== level) {
        //console.log('>>>>>> SET NEW LEVEL'+level);
        self.status[deviceId] = level;
        saveObject(self.statusId,self.status);
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
            1000*5,
            deviceId,
            level
        );
    }
    
    var virtualDevice   = self.virtualDevices[deviceId];
    var oldLevel        = self.status[deviceId];
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
        var relatedLevel    = relatedDevice.get('metrics:level');
        if (self.config.relatedDeviceComparison === 'gt'
            && relatedLevel > self.config.relatedDeviceLimit) {
            newLevel = Math.min(newLevel,self.config.deviceLimit);
        } else if (self.config.relatedDeviceComparison === 'lt'
            && relatedLevel < self.config.relatedDeviceLimit) {
            newLevel = Math.max(newLevel,self.config.deviceLimit);
        }
    }
    
    if (newLevel >= 99) {
        moveCommand = 'upMax';
        newLevel = 99;
        self.lock.add(
            deviceId,
            self.checkDevice,
            (deviceTime*2*1000),
            deviceId
        );
        realDevice.set('metrics:level',254);
    } else if (newLevel <= 0) {
        moveCommand = 'down';
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
        
        //console.log('>>>MOVE DEVICE FROM '+oldLevel+' TO '+newLevel FOR '+diffTime);
    }
    
    //console.log('>>>MOVE DEVICE'+deviceId+' WITH '+moveCommand);
    realDevice.performCommand(moveCommand);

    // Set status
    virtualDevice.set('metrics:level',newLevel);
    
    self.setStatus(deviceId,newLevel);
};

DeviceMove.prototype.stopDevice = function(deviceId) {
    var self        = this;
    var device      = self.controller.devices.get(deviceId);
    //console.log('>>>STOP DEVICE');
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
        //cosole.log('>>>POLL')
        device.performCommand("update");
    }
};

DeviceMove.prototype.checkDevice = function(deviceId,args) {
    var self            = this;
    
    console.logJS(self.lock);
    if (self.lock.running(deviceId)) {
        //console.log('>>>CHECK DEVICE IGNORE');
        return;
    }
    
    var realDevice      = self.controller.devices.get(deviceId);
    var virtualDevice   = self.virtualDevices[deviceId];
    var realLevel       = parseInt(realDevice.get('metrics:level'));
    var virtualLevel    = parseInt(virtualDevice.get('metrics:level'));
    var setLevel        = undefined;
    
    //console.log('>>>CHECK DEVICE'+deviceId+' - '+realLevel);
    console.logJS(args);
    // Detect full open
    if (self.config.report === 'open' && realLevel >= 99) {
        //console.log('>>>DETECT OPEN');
        self.setStatus(deviceId,99);
    // Detect full close
    } else if (self.config.report === 'close' && realLevel === 0) {
        //console.log('>>>DETECT CLOSE');
        self.setStatus(deviceId,0);
    // Init empty slot
    } else if (typeof(self.status[deviceId]) === 'undefined') {
        //console.log('>>>FIRST INIT '+realLevel);
        self.setStatus(deviceId,realLevel);
    // Correct partial open
    } else if (self.config.report === 'close' && realLevel > 0 && self.status[deviceId] === 0) {
        //console.log('>>>DETECT MISMATCH OPEN '+realLevel);
        self.setStatus(deviceId,realLevel);
    // Correct partial close
    } else if (self.config.report === 'open' && realLevel === 0 && self.status[deviceId] >= 99) {
        //console.log('>>>DETECT MISMATCH CLOSE '+realLevel);
        self.setStatus(deviceId,realLevel);
    }
    
    // Set update time
    virtualDevice.set('updateTime',realDevice.get('updateTime'));
};

 