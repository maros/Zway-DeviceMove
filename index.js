/*** DeviceMove Z-Way HA module *******************************************

Version: 1.10
(c) Maroš Kollár, 2015-2017
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

inherits(DeviceMove, BaseModule);

_module = DeviceMove;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

DeviceMove.prototype.init = function (config) {
    DeviceMove.super_.prototype.init.call(this, config);
    var self = this;

    self.difference     = parseInt(self.config.difference || 10);
    self.step           = parseInt(self.config.step || 1);
    self.delay          = new TimeoutManager(self);
    self.lock           = new TimeoutManager(self);
    self.timer          = setInterval(
        _.bind(self.checkAllDevices,self),
        (5*60*1000)
    );

    setTimeout(_.bind(self.initCallback,self),10000);
};

DeviceMove.prototype.initCallback = function() {
    var self = this;

    var icon = self.config.icon;

    // Loop all devices
    _.each(self.config.devices,function(deviceEntry) {
        var deviceId    = deviceEntry.device;
        var realDevice  = self.controller.devices.get(deviceId);
        if (realDevice === null) {
            self.error('Device not found '+deviceId);
            return;
        }
        // Set icon
        var deviceIcon  = icon;
        //var probeType   = realDevice.get('probeType');
        var title       = realDevice.get('metrics:title');
        if (icon === 'default') {
            deviceIcon  = realDevice.get('metrics:icon');
        } else if (icon === 'blind') {
            deviceIcon = 'blinds';
        } else {
            deviceIcon = icon;
        }

        // Hide and rename device
        title = title.replace(/\s*\[raw\]/,"");
        realDevice.set('metrics:title',title+' [raw]');
        realDevice.set('visibility', false);

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
                probeType: 'motor',
                tags: realDevice.get('tags'),
                location: realDevice.get('location'),
                metrics: {
                    icon: deviceIcon,
                    min: 0,
                    max: 100,
                    step: parseInt(self.config.step || 1)
                }
            },
            handler: function(command,args) {
                if (command === 'update') {
                    self.pollDevice(deviceId);
                    return;
                }
                var currentLevel = Math.min(100,this.get('metrics:level'));
                var targetLevel = this.get('metrics:target');
                if (targetLevel === undefined || targetLevel === null) {
                    targetLevel = currentLevel;
                } else {
                    targetLevel = Math.min(100,targetLevel);
                }
                var step = parseInt(self.config.step || 1);
                var newLevel;
                var delay = false;
                if (command === 'on' || command === 'up' || command === 'startUp' || command === 'upMax') {
                    newLevel = 100;
                } else if (command === 'off'|| command === 'down' || command === 'startDown') {
                    newLevel = 0;
                } else if ("exact" === command || "exactSmooth" === command) {
                    newLevel = args.level;
                    newLevel = Math.round(newLevel / step) * step;
                    if (newLevel === 0 && args.level > 0) {
                        newLevel = Math.max(step,10);
                    }
                    delay = true;
                } else if ("increase" === command) {
                    newLevel = currentLevel + step;
                } else if ("decrease" === command) {
                    newLevel = currentLevel - step;
                } else if ("stop" === command) {
                    // TODO figure out if we are currently moving, and try to calc new position
                    var action = this.get('metrics:action');
                    self.log('Stopped device '+deviceId);
                    if (_.isObject(action)) {
                        var currentTime = new Date().getTime() / 1000;
                        var oldLevel    = Math.min(100,action.oldLevel);
                        var diffTime    = currentTime - action.startTime;
                        var stepTime    = deviceEntry[(oldLevel > currentLevel) ? 'timeDown':'timeUp'] / 100;
                        var diffLevel   = parseInt(diffTime / stepTime,10);
                        var stopLevel   = (oldLevel > currentLevel) ? (oldLevel - diffLevel) : (oldLevel + diffLevel);
                        stopLevel = Math.min(100, stopLevel);
                        stopLevel = Math.max(0, stopLevel);
                        self.log('Moved '+diffTime+'sec ('+stepTime+'sec/step) to '+stopLevel+' (from '+oldLevel+')');
                        this.set('metrics:action',null,{ silent: true });
                        this.set('metrics:target',null,{ silent: true });
                        this.set('metrics:level',stopLevel,{ silent: true });
                        self.delay.clear(deviceId);
                        self.lock.clear(deviceId);
                    }
                    var realDevice = self.controller.devices.get(deviceId);
                    realDevice.performCommand('stop');
                    return;
                }

                if (currentLevel === newLevel) {
                    //self.log('Not moving device '+deviceId+'. Same level');
                    return;
                }
                if (newLevel === 0 || newLevel >= 99) {
                    delay = false;
                }
                this.set('metrics:target',newLevel,{ silent: true });
                self.log('Got command '+command+' for '+deviceId+': Set from '+currentLevel+' to '+newLevel+((delay) ? ' with delay':' without delay'));
                if (delay) {
                    self.delay.replace(
                        deviceId,
                        self.moveDevice,
                        1000*1.5,
                        deviceId,
                        newLevel,
                        'manual delayed'
                    );
                } else {
                    self.moveDevice(deviceId,newLevel,'manual');
                }
            },
            moduleId: self.id
        });

        self.virtualDevices[deviceId] = virtualDevice;

        // Build, register and call check callback
        var callback = _.bind(self.checkDevice,self,deviceId);
        realDevice.on('change:metrics:level',callback);
        setTimeout(callback,1000*5);
        self.callbacks[deviceId] = callback;
    });
};

DeviceMove.prototype.stop = function() {
    var self = this;

    DeviceMove.super_.prototype.stop.call(this);

    // Remove device & callbacks
    _.each(self.config.devices,function(deviceId){
        var realDevice = self.controller.devices.get(deviceId);
        if (realDevice === null) {
            return;
        }
        var virtualDevice = self.controller.devices.get(self.virtualDevices[deviceId]);

        if (virtualDevice !== null) {
            // Write back changes to real device
            var title       = realDevice.get('metrics:title');
            title = title.replace(/\s*\[raw\]\s*/,"");
            realDevice.set('metrics:title',title);
            realDevice.set('visibility',true);
            realDevice.set('tags',virtualDevice.get('tags'));
            realDevice.set('location',virtualDevice.get('location'));

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

    if (level >= 99) {
        level = 100;
    }

    // Set virtual device
    virtualDevice.set('metrics:level',level);
};

DeviceMove.prototype.moveDevice = function(deviceId,level,source) {
    var self = this;

    self.log('Got move device '+ deviceId+' to '+level+' from '+source);

    // Check if already running
    if (self.lock.running(deviceId)) {
        self.log('Device '+ deviceId+' is locked. Delay action');
        self.delay.replace(
            deviceId,
            self.moveDevice,
            (1000*10),
            deviceId,
            level, // Can produce race condition!!
            source + ' delayed'
        );
        return;
    }

    var virtualDevice   = self.virtualDevices[deviceId];
    var oldLevel        =  Math.min(virtualDevice.get('metrics:level'),100);
    var realDevice      = self.controller.devices.get(deviceId);
    var deviceEntry     = _.find(self.config.devices,function(deviceEntry) { return deviceEntry.device === deviceId; });
    if (deviceEntry === null) {
        self.error('Could not find real device '+deviceId);
        return;
    }
    var moveCommand;
    var newLevel        = parseInt(level,10);
    var maxTime         = Math.max(deviceEntry.timeUp,deviceEntry.timeDown);
    var commandLevel    = newLevel;
    var currentTime     = new Date().getTime() / 1000;

    // Check related devices
    if (self.config.relatedCheck
        && typeof(deviceEntry.relatedDevice) !== 'undefined') {
        var relatedDevice = self.controller.devices.get(deviceEntry.relatedDevice);
        if (relatedDevice === null) {
            self.error('Related device for '+deviceId+' not found '+deviceEntry.relatedDevice);
        } else {
            // Get related device level
            var relatedLevel = relatedDevice.get('metrics:level');
            var relatedRestrict = false;
            if (typeof(relatedLevel) === 'string'
                && relatedLevel === 'on') {
                relatedLevel = 100;
            } else if (typeof(relatedLevel) === 'string'
                && relatedLevel === 'off') {
                relatedLevel = 0;
            } else {
                relatedLevel = parseInt(relatedLevel,10);
            }
            // Fix level
            relatedLevel = Math.min(relatedLevel,100);

            // Related level - gt
            if ((self.config.relatedDeviceComparison === 'gt' || self.config.relatedDeviceComparison === 'gt_strict')
                && relatedLevel > self.config.relatedDeviceLimit) {
                if (oldLevel < self.config.deviceLimit
                    && self.config.relatedDeviceComparison === 'gt_strict') {
                    newLevel = oldLevel;
                } else {
                    newLevel = Math.max(newLevel,self.config.deviceLimit);
                }
                relatedRestrict = true;
            // Related level - lt
            } else if ((self.config.relatedDeviceComparison === 'lt' || self.config.relatedDeviceComparison === 'lt_strict')
                && relatedLevel < self.config.relatedDeviceLimit) {
                if (oldLevel > self.config.deviceLimit
                    && self.config.relatedDeviceComparison === 'lt_strict') {
                    newLevel = oldLevel;
                } else {
                    newLevel = Math.min(newLevel,self.config.deviceLimit);
                }
                relatedRestrict = true;
            }
            // Check new level
            if (relatedRestrict
                && newLevel === oldLevel) {
                self.log('Not movining due to related device at '+relatedLevel);
                return;
            } else if (commandLevel !== newLevel) {
                self.log('Constrained level to '+newLevel+' due to related device at '+relatedLevel);
            }
        }
    }

    if (newLevel >= 99) {
        moveCommand = 'startUp';
        newLevel = 255;
        self.lock.add(
            deviceId,
            function() {
                self.pollDevice(deviceId);
                virtualDevice.set('metrics:level',newLevel);
                self.stopDevice(deviceId);
            },
            (maxTime*1.1*1000)
        );
        virtualDevice.set('metrics:action',{
            startTime:  currentTime,
            oldLevel:   oldLevel,
            targetLevel:100,
            runTime:    deviceEntry.timeUp
        });
        realDevice.set('metrics:level',255);
    } else if (newLevel <= 0) {
        moveCommand = 'startDown';
        newLevel = 0;
        self.lock.add(
            deviceId,
            function() {
                self.pollDevice(deviceId);
                virtualDevice.set('metrics:level',newLevel);
                self.stopDevice(deviceId);
            },
            (maxTime*1.1*1000)
        );
        virtualDevice.set('metrics:action',{
            startTime:  currentTime,
            oldLevel:   oldLevel,
            targetLevel:0,
            runTime:    deviceEntry.timeDown
        });
        realDevice.set('metrics:level',0);
    } else {
        var diffLevel = Math.abs(oldLevel - newLevel);
        if (diffLevel < self.difference && oldLevel !== 0) {
            self.log('Not movining due minimum difference');
            return;
        }
        var stepTime    = deviceEntry[(oldLevel > newLevel) ? 'timeDown':'timeUp'] / 100;
        var diffTime    = stepTime * diffLevel;
        diffLevel       = Math.abs(diffTime / stepTime);
        moveCommand     = (oldLevel > newLevel) ? 'startDown':'startUp';
        newLevel        = parseInt((oldLevel < newLevel) ? oldLevel + diffLevel : oldLevel - diffLevel,10);
        self.lock.add(
            deviceId,
            function() {
                self.stopDevice(deviceId);
                virtualDevice.set('metrics:level',newLevel);
            },
            (diffTime * 1000)
        );
        virtualDevice.set('metrics:action',{
            startTime:  currentTime,
            oldLevel:   oldLevel,
            targetLevel:newLevel,
            runTime:    diffTime
        });
        self.log('Move device '+deviceId+' from '+oldLevel+' to '+newLevel+' for '+diffTime+' seconds');
    }

    realDevice.performCommand(moveCommand);
    self.setStatus(deviceId,newLevel);
};

DeviceMove.prototype.stopDevice = function(deviceId) {
    var self        = this;
    var realDevice  = self.controller.devices.get(deviceId);
    self.lock.add(
        deviceId,
        self.checkDevice,
        (5*1000),
        deviceId
    );

    self.virtualDevices[deviceId].set('metrics:action',null);
    self.virtualDevices[deviceId].set('metrics:target',null,{ 'silent': true });

    realDevice.performCommand("stop");
    realDevice.performCommand("update");
    //self.pollDevice(deviceId);
};

DeviceMove.prototype.checkAllDevices = function() {
    var self = this;
    self.log('Checking devices');

    _.each(self.config.devices,function(deviceEntry) {
        var deviceId        = deviceEntry.device;
        var realDevice      = self.controller.devices.get(deviceId);
        var virtualDevice   = self.virtualDevices[deviceId];
        var virtualLevel    = parseInt(virtualDevice.get('metrics:level'),10);
        var targetLevel     = virtualDevice.get('metrics:target');
        if (self.lock.running(deviceId)) {
            return;
        }
        if (typeof(targetLevel) === undefined || targetLevel === null || isNaN(targetLevel)) {
            return;
        } else {
            targetLevel = parseInt(targetLevel,10);
            if (targetLevel === virtualLevel) {
                virtualDevice.set('metrics:target',null,{ silent: true });
                return;
            }
        }

        virtualLevel        = Math.min(virtualLevel,100);
        targetLevel         = Math.min(targetLevel,100);
        self.log('Checking device'+deviceId+': '+virtualLevel+'-'+targetLevel+':'+Math.abs(virtualLevel - targetLevel));

        // Set target level
        if (virtualLevel !== targetLevel
            && Math.abs(virtualLevel - targetLevel) >= self.difference) {
            setTimeout(function() {
                self.log('Detected target mismatch for '+deviceId+'. Now moving');
                self.moveDevice(deviceId,targetLevel,'mismatch');
            },1000*30);
        }
        self.pollDevice(deviceId);
    });
};

DeviceMove.prototype.pollDevice = function(deviceId) {
    var self = this;

    var pollInterval    = 10*60*1000;
    var currentTime     = Math.floor(new Date().getTime() / 1000);
    var realDevice      = self.controller.devices.get(deviceId);
    if (realDevice === null) {
        return;
    }
    var updateTime      = realDevice.get('updateTime');
    if ((updateTime + pollInterval) < currentTime) {
        if (self.lock.running(realDevice.id)) {
            return;
        }
        self.log('Polling device '+realDevice.id);
        realDevice.performCommand("update");
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
    var targetLevel     = virtualDevice.get('metrics:target');
    virtualLevel        = Math.min(virtualLevel,100);
    realLevel           = Math.min(realLevel,100);
    var setLevel;

    // Detect full open
    if (self.config.report === 'open' && realLevel >= 99) {
        self.setStatus(deviceId,100);
    // Detect full close
    } else if (self.config.report === 'close' && realLevel === 0) {
        self.setStatus(deviceId,0);
    // Init empty slot
    } else if (isNaN(virtualLevel)) {
        self.setStatus(deviceId,realLevel);
    // Correct partial open
    } else if (self.config.report === 'close' && realLevel > 0 && virtualLevel === 0) {
        self.log('Detected status mismatch for '+deviceId+'. Now closed. Reporting '+realLevel);
        self.setStatus(deviceId,realLevel);
    // Correct partial close
    } else if (self.config.report === 'open' && realLevel === 0 && virtualLevel >= 99) {
        self.log('Detected status mismatch for '+deviceId+'. Now opened. Reporting '+realLevel);
        self.setStatus(deviceId,realLevel);
    }

    // Set update time
    virtualDevice.set('updateTime',realDevice.get('updateTime'));

    // Check target level
    if (targetLevel !== null) {
        targetLevel = Math.min(parseInt(targetLevel,10),100);
        if (virtualLevel !== targetLevel
            && Math.abs(virtualLevel - targetLevel) >= self.diff) {
            self.log('Detected target mismatch for '+deviceId+'. Now moving');
            self.moveDevice(deviceId,targetLevel,'check');
        } else if (virtualLevel === targetLevel) {
            virtualDevice.set('metrics:target',null,{ silent: true });
        }
    }
};


