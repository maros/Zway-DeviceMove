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
    
    self.devices = {};
    self.callbacks = {};
    
    console.log('DeviceMove: Init');
    
    var devicesConfig = self.config.devices;
    setTimeout(function() {
        _.each(devicesConfig,function(deviceId) {
            var device  = self.controller.devices.get(deviceId);
            
            console.log('DeviceMove: Process '+deviceId);
            console.log('DeviceMove: Got '+device);
            console.logJS(device);
            
            var icon    = device.get('metrics:icon') || "blinds";
            
            //device.set('visibility',false);
            //{"creatorId":11,"deviceType":"switchMultilevel","h":-1669838591,"hasHistory":false,"id":"DummyDevice_11","location":0,"metrics":{"level":"1","title":"Dummy 11"},"permanently_hidden":false,"tags":[],"visibility":true,"updateTime":1438377648}
            
            self.devices[deviceId] = this.controller.devices.create({
                deviceId: "DeviceMove_" + self.id+'_'+deviceId,
                location: device.get('location'),
                tags: device.get('tags'),
                defaults: {
                    metrics: {
                        title: device.get('metrics:title'),
                        icon: icon
                    }
                },
                overlay: {
                    deviceType: 'switchMultilevel',
                    metrics: {
                        linked: deviceId
                    }
                },
                handler: _.bind(self.moveDevice,self,deviceId),
                //updateTime: device.get('updateTime'),
                moduleId: self.id
            });
            
            self.callbacks[deviceId] = _.bind(self.checkDevice,self,deviceId);
            device.on('change:metrics:level',self.callbacks[deviceId]);
            self.callbacks[deviceId](device);
        });
    },10000);
    
    this.timer = setInterval(function() {
        self.pollDevice(self);
    }, 10*60*1000);
};

DeviceMove.prototype.stop = function() {
    var self = this;
    DeviceMove.super_.prototype.stop.call(this);
    
    // Remove device
    _.each(this.devices,function(deviceId,deviceObject){
        var device  = self.controller.devices.get(deviceId);
        self.controller.devices.remove(self.devices[deviceId]);
    });
    
    // Remove callbacks
    _.each(this.callbacks,function(deviceId,callbackFunction) {
        var device  = self.controller.devices.get(deviceId);
        device.off('change:metrics:level',callbackFunction);
    });
    this.devices = {};
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

DeviceMove.prototype.moveDevice = function(deviceId,command,args) {
    var self        = this;
    var vDev        = self.devices[deviceId];
    var oldLevel    = vDev.get("metrics:level");
    var newLevel    = paseInt(args.level);
    //var diffDir     = deviceTime / 99;
    var deviceTime  = parseInt(self.config.time);
    var stepTime    = deviceTime / 99;
    var device      = self.controller.devices.get(deviceId);
    var moveDir     = undefined;
    
    console.log("DeviceMove SET from "+oldLevel+' to '+command);
    
    //instance = this.zway.devices[nodeId].instances[instanceId],
    //instanceCommandClasses = Object.keys(instance.commandClasses).map(function(x) { return parseInt(x); }),
    //cc = instance.commandClasses[commandClassId],
    
    if (command === 'exact') {
        var diffLevel = Math.abs(oldLevel - newLevel);
        
        if (diffLevel <= 5) {
            return;
        }
        
        var diffTime = Math.abs(stepTime * diffLevel);
        moveDir = (oldLevel > newLevel) ? 'up':'down';
        
        newLevel     = diffTime * stepTime;
        
        device.performCommand(moveDir);
        
        setTimeout(
            _.bind(self.stopDevice,self,deviceId),
            (diffTime * 1000)
        );
    } else if (command === 'on'|| command === 'up') {
        moveDir = 'up';
    } else if (command === 'off'|| command === 'down') {
        moveDir = 'down';
    }
    
    self.devices[deviceId].set('metrics:level',newLevel);
    
    // {"level":"22"}
    //vDev.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/RandomDevice/icon_"+level+".png");
};

DeviceMove.prototype.stopDevice = function(deviceId) {
    var self        = this;
    var device      = self.controller.devices.get(deviceId);
    device.performCommand("stop");
};

DeviceMove.prototype.pollDevice = function() {
    var self = this;
    console.log("DeviceMove POLL");
    _.each(self.config.devices,function(deviceId) {
        var device =  self.controller.devices.get(deviceId);
        var updateTime = device.get('updateTime');
        //device.performCommand("update");
    });
};

DeviceMove.prototype.checkDevice = function(deviceId,event) {
    var self        = this;
    
    console.log("DeviceMove CHECK"+deviceId);
    
    var rDevice     = self.controller.devices.get(deviceId);
    var vDevice     = self.devices[deviceId];
    var rLevel      = parseInt(rDevice.get('metrics:level'));
    var vLevel      = parseInt(vDevice.get('metrics:level'));
    var setLevel    = undefined;
    
    if ((self.config.report === 'open' || self.config.report === 'both')
        && rLevel >= 99) {
        setLevel = 99;
    } else if ((self.config.report === 'close' || self.config.report === 'both')
        && rLevel === 0) {
        setLevel = 0;
    }
    
    if (typeof(vLevel) === 'undefined') {
        setLevel = rLevel;
    }
    
    if (typeof(setLevel) !== 'undefined' 
        && setLevel !== vLevel) {
        console.log("DeviceMove setLevel "+setLevel);
        vDevice.set('metrics:level',setLevel);
        vDevice.set('updateTime',rDevice.get('updateTime'));
    }
};

 