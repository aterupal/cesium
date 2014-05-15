/*global define*/
define([
        '../Core/Cartesian2',
        '../Core/defined',
        '../Core/destroyObject',
        '../Core/DeveloperError',
        '../Core/KeyboardEventModifier',
        '../Core/Math',
        '../Core/ScreenSpaceEventHandler',
        '../Core/ScreenSpaceEventType',
        './CameraEventType'
    ], function(
        Cartesian2,
        defined,
        destroyObject,
        DeveloperError,
        KeyboardEventModifier,
        CesiumMath,
        ScreenSpaceEventHandler,
        ScreenSpaceEventType,
        CameraEventType) {
    "use strict";

    function getKey(type, modifier) {
        var key = type;
        if (defined(modifier)) {
            key += '+' + modifier;
        }
        return key;
    }

    function clonePinchMovement(pinchMovement, result) {
        Cartesian2.clone(pinchMovement.distance.startPosition, result.distance.startPosition);
        Cartesian2.clone(pinchMovement.distance.endPosition, result.distance.endPosition);

        Cartesian2.clone(pinchMovement.angleAndHeight.startPosition, result.angleAndHeight.startPosition);
        Cartesian2.clone(pinchMovement.angleAndHeight.endPosition, result.angleAndHeight.endPosition);
    }

    function listenToPinch(aggregator, modifier, canvas) {
        var key = getKey(CameraEventType.PINCH, modifier);

        var update = aggregator._update;
        var isDown = aggregator._isDown;
        var pressTime = aggregator._pressTime;
        var releaseTime = aggregator._releaseTime;

        update[key] = true;
        isDown[key] = false;

        var movement = aggregator._movement[key];
        if (!defined(movement)) {
            movement = aggregator._movement[key] = {};
        }

        movement.distance = {
            startPosition : new Cartesian2(),
            endPosition : new Cartesian2()
        };
        movement.angleAndHeight = {
            startPosition : new Cartesian2(),
            endPosition : new Cartesian2()
        };
        movement.prevAngle = 0.0;

        aggregator._eventHandler.setInputAction(function() {
            aggregator._buttonsDown++;
            isDown[key] = true;
            pressTime[key] = new Date();
        }, ScreenSpaceEventType.PINCH_START, modifier);

        aggregator._eventHandler.setInputAction(function() {
            aggregator._buttonsDown = Math.max(aggregator._buttonsDown - 1, 0);
            isDown[key] = false;
            releaseTime[key] = new Date();
        }, ScreenSpaceEventType.PINCH_END, modifier);

        aggregator._eventHandler.setInputAction(function(mouseMovement) {
            if (isDown[key]) {
                // Aggregate several input events into a single animation frame.
                if (!update[key]) {
                    Cartesian2.clone(mouseMovement.distance.endPosition, movement.distance.endPosition);
                    Cartesian2.clone(mouseMovement.angleAndHeight.endPosition, movement.angleAndHeight.endPosition);
                } else {
                    clonePinchMovement(mouseMovement, movement);
                    update[key] = false;
                    movement.prevAngle = movement.angleAndHeight.startPosition.x;
                }
                // Make sure our aggregation of angles does not "flip" over 360 degrees.
                var angle = movement.angleAndHeight.endPosition.x;
                var prevAngle = movement.prevAngle;
                var TwoPI = Math.PI * 2;
                while (angle >= (prevAngle + Math.PI)) {
                    angle -= TwoPI;
                }
                while (angle < (prevAngle - Math.PI)) {
                    angle += TwoPI;
                }
                movement.angleAndHeight.endPosition.x = -angle * canvas.clientWidth / 12;
                movement.angleAndHeight.startPosition.x = -prevAngle * canvas.clientWidth / 12;
            }
        }, ScreenSpaceEventType.PINCH_MOVE, modifier);
    }

    function listenToWheel(aggregator, modifier) {
        var key = getKey(CameraEventType.WHEEL, modifier);

        var update = aggregator._update;
        update[key] = true;

        var movement = aggregator._movement[key];
        if (!defined(movement)) {
            movement = aggregator._movement[key] = {};
        }

        movement.startPosition = new Cartesian2();
        movement.endPosition = new Cartesian2();

        aggregator._eventHandler.setInputAction(function(delta) {
            // TODO: magic numbers
            var arcLength = 15.0 * CesiumMath.toRadians(delta);
            if (!update[key]) {
                movement.endPosition.y = movement.endPosition.y + arcLength;
            } else {
                Cartesian2.clone(Cartesian2.ZERO, movement.startPosition);
                movement.endPosition.x = 0.0;
                movement.endPosition.y = arcLength;
                update[key] = false;
            }
        }, ScreenSpaceEventType.WHEEL, modifier);
    }

    function listenMouseButtonDownUp(aggregator, modifier, type) {
        var key = getKey(type, modifier);

        var isDown = aggregator._isDown;
        var pressTime = aggregator._pressTime;
        var releaseTime = aggregator._releaseTime;

        isDown[key] = false;

        var lastMovement = aggregator._lastMovement[key];
        if (!defined(lastMovement)) {
            lastMovement = aggregator._lastMovement[key] = {
                startPosition : new Cartesian2(),
                endPosition : new Cartesian2(),
                valid : false
            };
        }

        var down;
        var up;
        if (type === CameraEventType.LEFT_DRAG) {
            down = ScreenSpaceEventType.LEFT_DOWN;
            up = ScreenSpaceEventType.LEFT_UP;
        } else if (type === CameraEventType.RIGHT_DRAG) {
            down = ScreenSpaceEventType.RIGHT_DOWN;
            up = ScreenSpaceEventType.RIGHT_UP;
        } else if (type === CameraEventType.MIDDLE_DRAG) {
            down = ScreenSpaceEventType.MIDDLE_DOWN;
            up = ScreenSpaceEventType.MIDDLE_UP;
        }

        aggregator._eventHandler.setInputAction(function() {
            aggregator._buttonsDown++;
            lastMovement.valid = false;
            isDown[key] = true;
            pressTime[key] = new Date();
        }, down, modifier);

        aggregator._eventHandler.setInputAction(function() {
            aggregator._buttonsDown = Math.max(aggregator._buttonsDown - 1, 0);
            isDown[key] = false;
            releaseTime[key] = new Date();
        }, up, modifier);
    }

    function cloneMouseMovement(mouseMovement, result) {
        Cartesian2.clone(mouseMovement.startPosition, result.startPosition);
        Cartesian2.clone(mouseMovement.endPosition, result.endPosition);
    }

    function listenMouseMove(aggregator, modifier) {
        var update = aggregator._update;
        var movement = aggregator._movement;
        var lastMovement = aggregator._lastMovement;
        var isDown = aggregator._isDown;

        for ( var typeName in CameraEventType) {
            if (CameraEventType.hasOwnProperty(typeName)) {
                var type = CameraEventType[typeName];
                if (defined(type)) {
                    var key = getKey(type, modifier);
                    update[key] = true;

                    if (!defined(aggregator._lastMovement[key])) {
                        aggregator._lastMovement[key] = {
                            startPosition : new Cartesian2(),
                            endPosition : new Cartesian2(),
                            valid : false
                        };
                    }

                    if (!defined(aggregator._movement[key])) {
                        aggregator._movement[key] = {
                            startPosition : new Cartesian2(),
                            endPosition : new Cartesian2()
                        };
                    }
                }
            }
        }

        aggregator._eventHandler.setInputAction(function(mouseMovement) {
            for ( var typeName in CameraEventType) {
                if (CameraEventType.hasOwnProperty(typeName)) {
                    var type = CameraEventType[typeName];
                    if (defined(type)) {
                        var key = getKey(type, modifier);
                        if (isDown[key]) {
                            if (!update[key]) {
                                Cartesian2.clone(mouseMovement.endPosition, movement[key].endPosition);
                            } else {
                                cloneMouseMovement(movement[key], lastMovement[key]);
                                lastMovement[key].valid = true;
                                cloneMouseMovement(mouseMovement, movement[key]);
                                update[key] = false;
                            }
                        }
                    }
                }
            }
        }, ScreenSpaceEventType.MOUSE_MOVE, modifier);
    }

    /**
     * Aggregates input events. For example, suppose the following inputs are received between frames:
     * left mouse button down, mouse move, mouse move, left mouse button up. These events will be aggregated into
     * one event with a start and end position of the mouse.
     *
     * @alias CameraEventAggregator
     * @constructor
     *
     * @param {HTMLCanvasElement} canvas DOC_TBA
     *
     * @see ScreenSpaceEventHandler
     */
    var CameraEventAggregator = function(canvas) {
        //>>includeStart('debug', pragmas.debug);
        if (!defined(canvas)) {
            throw new DeveloperError('canvas is required.');
        }
        //>>includeEnd('debug');

        this._eventHandler = new ScreenSpaceEventHandler(canvas);

        this._update = {};
        this._movement = {};
        this._lastMovement = {};
        this._isDown = {};
        this._pressTime = {};
        this._releaseTime = {};

        this._buttonsDown = 0;

        listenToWheel(this, undefined);
        listenToPinch(this, undefined, canvas);
        listenMouseButtonDownUp(this, undefined, CameraEventType.LEFT_DRAG);
        listenMouseButtonDownUp(this, undefined, CameraEventType.RIGHT_DRAG);
        listenMouseButtonDownUp(this, undefined, CameraEventType.MIDDLE_DRAG);
        listenMouseMove(this, undefined);

        for ( var modifierName in KeyboardEventModifier) {
            if (KeyboardEventModifier.hasOwnProperty(modifierName)) {
                var modifier = KeyboardEventModifier[modifierName];
                if (defined(modifier)) {
                    listenToWheel(this, modifier);
                    listenToPinch(this, modifier, canvas);
                    listenMouseButtonDownUp(this, modifier, CameraEventType.LEFT_DRAG);
                    listenMouseButtonDownUp(this, modifier, CameraEventType.RIGHT_DRAG);
                    listenMouseButtonDownUp(this, modifier, CameraEventType.MIDDLE_DRAG);
                    listenMouseMove(this, modifier);
                }
            }
        }
    };

    /**
     * Gets if a mouse button down or touch has started and has been moved.
     * @memberof CameraEventAggregator
     *
     * @param {CameraEventType} type The camera event type.
     * @param {KeyboardEventModifier} [modifier] The keyboard modifier.
     * @returns {Boolean} Returns <code>true</code> if a mouse button down or touch has started and has been moved; otherwise, <code>false</code>
     */
    CameraEventAggregator.prototype.isMoving = function(type, modifier) {
        //>>includeStart('debug', pragmas.debug);
        if (!defined(type)) {
            throw new DeveloperError('type is required.');
        }
        //>>includeEnd('debug');

        var key = getKey(type, modifier);
        return !this._update[key];
    };

    /**
     * Gets the aggregated start and end position of the current event.
     * @memberof CameraEventAggregator
     *
     * @param {CameraEventType} type The camera event type.
     * @param {KeyboardEventModifier} [modifier] The keyboard modifier.
     * @returns {Object} An object with two {@link Cartesian2} properties: <code>startPosition</code> and <code>endPosition</code>.
     */
    CameraEventAggregator.prototype.getMovement = function(type, modifier) {
        //>>includeStart('debug', pragmas.debug);
        if (!defined(type)) {
            throw new DeveloperError('type is required.');
        }
        //>>includeEnd('debug');

        var key = getKey(type, modifier);
        var movement = this._movement[key];
        return movement;
    };

    /**
     * Gets the start and end position of the last move event (not the aggregated event).
     * @memberof CameraEventAggregator
     *
     * @param {CameraEventType} type The camera event type.
     * @param {KeyboardEventModifier} [modifier] The keyboard modifier.
     * @returns {Object|undefined} An object with two {@link Cartesian2} properties: <code>startPosition</code> and <code>endPosition</code> or <code>undefined</code>.
     */
    CameraEventAggregator.prototype.getLastMovement = function(type, modifier) {
        //>>includeStart('debug', pragmas.debug);
        if (!defined(type)) {
            throw new DeveloperError('type is required.');
        }
        //>>includeEnd('debug');

        var key = getKey(type, modifier);
        var lastMovement = this._lastMovement[key];
        if (lastMovement.valid) {
            return lastMovement;
        }

        return undefined;
    };

    /**
     * Gets whether the mouse button is down or a touch has started.
     * @memberof CameraEventAggregator
     *
     * @param {CameraEventType} type The camera event type.
     * @param {KeyboardEventModifier} [modifier] The keyboard modifier.
     * @returns {Boolean} Whether the mouse button is down or a touch has started.
     */
    CameraEventAggregator.prototype.isButtonDown = function(type, modifier) {
        //>>includeStart('debug', pragmas.debug);
        if (!defined(type)) {
            throw new DeveloperError('type is required.');
        }
        //>>includeEnd('debug');

        var key = getKey(type, modifier);
        return this._isDown[key];
    };

    /**
     * Gets whether any mouse button is down, a touch has started, or the wheel has been moved.
     * @memberof CameraEventAggregator
     *
     * @returns {Boolean} Whether any mouse button is down, a touch has started, or the wheel has been moved.
     */
    CameraEventAggregator.prototype.anyButtonDown = function() {
        var wheelMoved = !this._update[getKey(CameraEventType.WHEEL)] ||
                        !this._update[getKey(CameraEventType.WHEEL, KeyboardEventModifier.SHIFT)] ||
                        !this._update[getKey(CameraEventType.WHEEL, KeyboardEventModifier.CTRL)] ||
                        !this._update[getKey(CameraEventType.WHEEL, KeyboardEventModifier.ALT)];
        return this._buttonsDown > 0 || wheelMoved;
    };

    /**
     * Gets the time the button was pressed or the touch was started.
     * @memberof CameraEventAggregator
     *
     * @param {CameraEventType} type The camera event type.
     * @param {KeyboardEventModifier} [modifier] The keyboard modifier.
     * @returns {Date} The time the button was pressed or the touch was started.
     */
    CameraEventAggregator.prototype.getButtonPressTime = function(type, modifier) {
        //>>includeStart('debug', pragmas.debug);
        if (!defined(type)) {
            throw new DeveloperError('type is required.');
        }
        //>>includeEnd('debug');

        var key = getKey(type, modifier);
        return this._pressTime[key];
    };

    /**
     * Gets the time the button was released or the touch was ended.
     * @memberof CameraEventAggregator
     *
     * @param {CameraEventType} type The camera event type.
     * @param {KeyboardEventModifier} [modifier] The keyboard modifier.
     * @returns {Date} The time the button was released or the touch was ended.
     */
    CameraEventAggregator.prototype.getButtonReleaseTime = function(type, modifier) {
        //>>includeStart('debug', pragmas.debug);
        if (!defined(type)) {
            throw new DeveloperError('type is required.');
        }
        //>>includeEnd('debug');

        var key = getKey(type, modifier);
        return this._releaseTime[key];
    };

    /**
     * Signals that all of the events have been handled and the aggregator should be reset to handle new events.
     * @memberof CameraEventAgregator
     */
    CameraEventAggregator.prototype.reset = function() {
        for ( var name in this._update) {
            if (this._update.hasOwnProperty(name)) {
                this._update[name] = true;
            }
        }
    };

    /**
     * Returns true if this object was destroyed; otherwise, false.
     * <br /><br />
     * If this object was destroyed, it should not be used; calling any function other than
     * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.
     *
     * @memberof CameraEventAggregator
     *
     * @returns {Boolean} <code>true</code> if this object was destroyed; otherwise, <code>false</code>.
     *
     * @see CameraEventAggregator#destroy
     */
    CameraEventAggregator.prototype.isDestroyed = function() {
        return false;
    };

    /**
     * Removes mouse listeners held by this object.
     * <br /><br />
     * Once an object is destroyed, it should not be used; calling any function other than
     * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.  Therefore,
     * assign the return value (<code>undefined</code>) to the object as done in the example.
     *
     * @memberof CameraEventAggregator
     *
     * @returns {undefined}
     *
     * @exception {DeveloperError} This object was destroyed, i.e., destroy() was called.
     *
     * @see CameraEventAggregator#isDestroyed
     *
     * @example
     * handler = handler && handler.destroy();
     */
    CameraEventAggregator.prototype.destroy = function() {
        this._eventHandler = this._eventHandler && this._eventHandler.destroy();
        return destroyObject(this);
    };

    return CameraEventAggregator;
});
