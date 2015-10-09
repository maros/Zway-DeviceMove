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
    
    self.virtualDevices = {};
    self.callbacks = {};
    self.timers = {};
    
    self.statusId = "DeviceMove_" + self.id;
    self.status = loadObject(self.statusId) || {};
    
    setTimeout(_.bind(self.initCallback,self),10000);
    self.timer = setInterval(_.bind(self.pollDevices,self), 10*60*1000);
};

DeviceMove.prototype.initCallback = function() {
    var self = this;
    
    _.each(self.config.devices,function(deviceEntry) {
        var deviceId    = deviceEntry.device;
        var realDevice  = self.controller.devices.get(deviceId);
        var icon        = realDevice.get('metrics:icon') || "blinds";
        
        // Create virtual device
        var virtualDevice = this.controller.devices.create({
            deviceId: "DeviceMove_" + self.id+'_'+deviceId,
            location: realDevice.get('location'),
            tags: realDevice.get('tags'),
            defaults: {
                deviceType: 'switchMultilevel',
                metrics: {
                    title: realDevice.get('metrics:title')+"VIRT",
                    icon: icon
                }
            },
            overlay: {
                deviceType: 'switchMultilevel'
            },
            handler: function(command,args) {
                if (command === 'update') {
                    return;
                }
                if (typeof(self.timers[deviceId]) !== 'undefined') {
                    clearTimeout(self.timers[deviceId]);
                }
                self.timers[deviceId] = setTimeout(
                    _.bind(self.moveDevice,self,deviceId,command,args.level),
                    1000*2
                );
            },
            moduleId: self.id
        });
        
        self.virtualDevices[deviceId] = virtualDevice;
        
        // Hide real device
        // realDevice.set('visibility',false);
        
        // Init level
        if (typeof(self.status[deviceId]) !== 'undefined') {
            console.log('>>>INIT'+deviceId+' FROM STORAGE');
            virtualDevice.set('metrics:level',self.status[deviceId]);
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
    // Save status
    saveObject(self.statusId,self.status);
    
    DeviceMove.super_.prototype.stop.call(this);
    
    // Remove device
    _.each(self.virtualDevices,function(deviceId,deviceObject){
        self.controller.devices.remove(deviceObject);
    });
    
    // Remove callbacks
    _.each(self.callbacks,function(deviceId,callbackFunction) {
        var device  = self.controller.devices.get(deviceId);
        device.off('change:metrics:level',callbackFunction);
    });
    
    self.virtualDevices = {};
    self.callbacks = {};
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

DeviceMove.prototype.moveDevice = function(deviceId,command,level) {
    var self            = this;
    
    // TODO check paralell movement 
    
    if (typeof(self.timers[deviceId]) !== 'undefined') {
        clearTimeout(self.timers[deviceId]);
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
    
    //instance = this.zway.devices[nodeId].instances[instanceId],
    //instanceCommandClasses = Object.keys(instance.commandClasses).map(function(x) { return parseInt(x); }),
    //cc = instance.commandClasses[commandClassId],
    
    if (command === 'on' || command === 'up' || (command === 'exact' && level === 99)) {
        moveCommand = 'upMax';
        newLevel = 99;
    } else if (command === 'off'|| command === 'down' || (command === 'exact' && level === 0)) {
        moveCommand = 'down';
        newLevel = 0;
    } else if (command === 'exact') {
        var diffLevel = Math.abs(oldLevel - newLevel);
        if (diffLevel <= 5) {
            return;
        }
        var diffTime    = stepTime * diffLevel;
        moveCommand     = (oldLevel > newLevel) ? 'startDown':'startUp';
        diffLevel       = Math.abs(diffTime / stepTime);
        newLevel        = (oldLevel < newLevel) ? oldLevel + diffLevel : oldLevel - diffLevel;
        
        setTimeout(
            _.bind(self.stopDevice,self,deviceId),
            (diffTime * 1000)
        );
        console.log('>>> RUN FOR '+diffTime);
    }
    
    console.log('>>> RUN'+moveCommand);
    realDevice.performCommand(moveCommand);

    // Set status
    virtualDevice.set('metrics:level',newLevel);
    self.status[deviceId] = newLevel;
    
    // Save status
    saveObject(self.statusId,self.status);
};

DeviceMove.prototype.stopDevice = function(deviceId) {
    var self        = this;
    var device      = self.controller.devices.get(deviceId);
    device.performCommand("stop");
};

DeviceMove.prototype.pollDevices = function() {
    var self = this;
    
    _.each(self.config.devices,function(deviceEntry) {
        var device =  self.controller.devices.get(deviceEntry.device);
        var updateTime = device.get('updateTime');
        // TODO 
        //device.performCommand("update");
    });
};

DeviceMove.prototype.checkDevice = function(deviceId,args) {
    var self            = this;
    var realDevice      = self.controller.devices.get(deviceId);
    var virtualDevice   = self.virtualDevices[deviceId];
    var realLevel       = parseInt(realDevice.get('metrics:level'));
    var virtualLevel    = parseInt(virtualDevice.get('metrics:level'));
    var setLevel        = undefined;
    
    if ((self.config.report === 'open' || self.config.report === 'both')
        && realLevel >= 99) {
        setLevel = 99;
    } else if ((self.config.report === 'close' || self.config.report === 'both')
        && realLevel === 0) {
        setLevel = 0;
    }
    
    // Init empty slot
    if (typeof(self.status[deviceId]) === 'undefined') {
        setLevel = realLevel;
    }
    
    console.log('CHECK DEVICE'+setLevel);
    console.logJS(realDevice);
    
    // Set new level
    if (typeof(setLevel) !== 'undefined' 
        && setLevel !== self.status[deviceId]) {
        self.status[deviceId] = setLevel;
        
        // Save status
        saveObject(self.statusId,self.status);
    }
    
    // Set update time
    virtualDevice.set('updateTime',realDevice.get('updateTime'));
};

 