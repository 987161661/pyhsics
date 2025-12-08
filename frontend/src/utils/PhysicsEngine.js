import Matter from 'matter-js';

// 模块解构
        const { Engine, Render, Runner, World, Bodies, Body, Composite, Constraint, Vector, Vertices, Geometry, Query } = Matter;


class PhysicsSceneBuilder {
    constructor(elementId, width = 800, height = 600) {
        this.width = width;
        this.height = height;
        this.elementId = elementId;
        
        // 初始化引擎
        this.engine = Engine.create();
        
        // Improve collision detection accuracy to prevent tunneling
        this.engine.positionIterations = 8;
        this.engine.velocityIterations = 8;
        
        this.world = this.engine.world;
        
        // 存储所有创建的实体，方便后续查找
        this.entities = {}; // Mapping ID -> Matter.Body
        this.sceneData = {}; // Mapping ID -> { x, y, z, width, height, depth, type, ... }
        this.customConstraints = [];
        this.frictionConstraints = [];
        this.hasRegisteredEvents = false;
        this.hasRegisteredCollision = false;
        this.currentViewMode = 'side'; // 'side' | 'top'
        this.globalAirResistance = 0.0;

        // 注册更新循环
        this._registerCustomUpdate();
    }

    /**
     * 获取引擎实例
     */
    getEngine() {
        return this.engine;
    }

    /**
     * 清空场景
     */
    clear() {
        Composite.clear(this.world);
        Engine.clear(this.engine);
        this.entities = {};
        this.sceneData = {};
        this.customConstraints = [];
        this.trajectories = {}; // Store trajectory paths: { bodyId: [{x,y}, ...] }
    }

    /**
     * 切换视图模式并重建物理世界
     * @param {string} mode 'side' | 'top'
     */
    setViewMode(mode) {
        if (this.currentViewMode === mode) return;

        // 1. 同步当前物理状态到 sceneData
        this.syncToSceneData();

        // 2. 切换模式
        this.currentViewMode = mode;

        // 3. 根据新模式重建物理世界
        this.rebuildWorld();
    }

    /**
     * 将当前 Matter.js 物理状态同步回 sceneData
     */
    syncToSceneData() {
        Object.keys(this.entities).forEach(id => {
            const body = this.entities[id];
            const data = this.sceneData[id];
            if (!body || !data) return;

            let bodyX = body.position.x;
            let bodyY = body.position.y;

            // Correct for offset if necessary (Inverse of creation logic)
            if (this.currentViewMode === 'side' && (data.type === 'Triangle' || data.type === 'Incline' || data.type === 'Cone' || data.type === 'Trapezoid')) {
                 const renderW = data.width || (body.bounds.max.x - body.bounds.min.x);
                 const renderH = data.height || (body.bounds.max.y - body.bounds.min.y);
                 const offset = this._getCenterOffset(data.type, renderW, renderH);
                 bodyX -= offset.x;
                 bodyY -= offset.y;
            }

            if (this.currentViewMode === 'side') {
                // Side View: Matter(x, y) -> Data(x, y)
                data.x = bodyX;
                data.y = bodyY;
                data.angle = body.angle;
                // z remains unchanged
            } else {
                // Top View: Matter(x, y) -> Data(x, z)
                data.x = bodyX;
                data.z = bodyY; // Map visual Y to Z
                // y remains unchanged
                data.angleTop = body.angle; 
            }
        });
    }

    /**
     * 根据 sceneData 重建 Matter.js 世界
     */
    rebuildWorld() {
        Composite.clear(this.world);
        this.entities = {}; // Clear body references, will rebuild
        
        // Set Gravity
        if (this.currentViewMode === 'top') {
            this.engine.world.gravity.y = 0; // Top view has no vertical gravity usually
        } else {
            this.engine.world.gravity.y = 1;
        }

        Object.values(this.sceneData).forEach(data => {
            this._createBodyFromData(data);
        });
        
        // TODO: Re-add constraints (ropes etc.) if needed. 
        // Note: Constraints might need projection too. For now, focusing on bodies.
    }

    _getCenterOffset(type, width, height) {
        if (type === 'Triangle' || type === 'Incline') {
            // For a Right Triangle (Ramp) with vertices (0,h), (w,h), (w,0)
            // Centroid relative to BBox Center (w/2, h/2) is (w/6, h/6)
            return { x: width / 6, y: height / 6 };
        }
        if (type === 'Cone') {
            // For Cone in Side View (Isosceles Triangle)
            // Vertices relative to center: (0, -h/2), (w/2, h/2), (-w/2, h/2)
            // CoM relative to BBox Center (0,0) is (0, h/6)
            return { x: 0, y: height / 6 };
        }
        if (type === 'Trapezoid') {
            // Trapezoid (slope=0.5)
            // Centroid is lower than geometric center (wider bottom)
            // Offset Y = h^2 / (6 * (2w - h))
            // Avoid division by zero if 2w = h (though unlikely for trapezoid)
            const denom = 6 * (2 * width - height);
            if (denom <= 0) return { x: 0, y: 0 };
            return { x: 0, y: (height * height) / denom };
        }
        return { x: 0, y: 0 };
    }

    _createBodyFromData(data) {
        let body;
        let renderX, renderY, renderW, renderH;

        if (this.currentViewMode === 'side') {
            renderX = data.x;
            renderY = data.y;
            renderW = data.width !== undefined ? data.width : (data.radius ? data.radius * 2 : 50);
            renderH = data.height !== undefined ? data.height : (data.radius ? data.radius * 2 : 50);
        } else {
            renderX = data.x;
            renderY = data.z; // Map Z to visual Y
            renderW = data.width !== undefined ? data.width : (data.radius ? data.radius * 2 : 50);
            renderH = data.depth !== undefined ? data.depth : (data.radius ? data.radius * 2 : 50);
        }

        const commonOptions = {
            isStatic: data.isStatic,
            friction: data.friction,
            frictionAir: data.frictionAir !== undefined ? data.frictionAir : (this.globalAirResistance || 0.0),
            angle: (this.currentViewMode === 'side' ? data.angle : (data.angleTop || 0)) || 0,
            render: { fillStyle: data.color },
            label: data.type,
            plugin: { userLabel: data.id }
        };

        // 1. Create the intended shape body first (to get visual dimensions/vertices)
        // Apply Offset for shapes where CoM != BBox Center (e.g. Triangle in Side View)
        let offsetX = 0;
        let offsetY = 0;
        if (this.currentViewMode === 'side' && (data.type === 'Triangle' || data.type === 'Incline' || data.type === 'Cone' || data.type === 'Trapezoid')) {
             const offset = this._getCenterOffset(data.type, renderW, renderH);
             offsetX = offset.x;
             offsetY = offset.y;
        }

        let shapeBody = null;

        if (data.type === 'Rectangle' || data.type === 'Box' || data.type === 'Ground' || data.type === 'Wall' || data.type === 'Conveyor') {
            shapeBody = Bodies.rectangle(renderX, renderY, renderW, renderH, commonOptions);
            shapeBody.width = renderW;
            shapeBody.height = renderH;
        } else if (data.customVertices) {
            // Custom Polygon (e.g. from Cut)
            if (this.currentViewMode === 'side') {
                shapeBody = Bodies.fromVertices(renderX, renderY, [data.customVertices], commonOptions);
            } else {
                shapeBody = Bodies.rectangle(renderX, renderY, 50, data.depth || 50, commonOptions);
            }
        } else if (data.type === 'Circle') {
            // Circle or Ellipse
            const radius = Math.max(renderW, renderH) / 2;
            shapeBody = Bodies.circle(renderX, renderY, radius, commonOptions);
            
            if (Math.abs(renderW - renderH) > 0.1) {
                 const scaleX = renderW / (radius * 2);
                 const scaleY = renderH / (radius * 2);
                 Body.scale(shapeBody, scaleX, scaleY);
            }
            
            shapeBody.radius = radius; 
            shapeBody.width = renderW;
            shapeBody.height = renderH;
        } else if (data.type === 'Triangle' || data.type === 'Incline') {
             // Triangle (Ramp)
             if (this.currentViewMode === 'side') {
                const vertices = [
                    { x: 0, y: renderH },
                    { x: renderW, y: renderH },
                    { x: renderW, y: 0 }
                ];
                shapeBody = Bodies.fromVertices(renderX + offsetX, renderY + offsetY, [vertices], commonOptions);
             } else {
                 shapeBody = Bodies.rectangle(renderX, renderY, renderW, renderH, commonOptions);
                 shapeBody.width = renderW;
                 shapeBody.height = renderH;
             }
        } else if (data.type === 'Trapezoid') {
            // Trapezoid
            if (this.currentViewMode === 'side') {
                 shapeBody = Bodies.trapezoid(renderX + offsetX, renderY + offsetY, renderW, renderH, 0.5, commonOptions);
            } else {
                 shapeBody = Bodies.rectangle(renderX, renderY, renderW, renderH, commonOptions);
                 shapeBody.width = renderW;
                 shapeBody.height = renderH;
            }
        } else if (data.type === 'Capsule') {
             // Capsule
             const radius = Math.min(renderW, renderH) / 2;
             const chamfer = { radius: [radius, radius, radius, radius] };
             const options = { ...commonOptions, chamfer };
             
             shapeBody = Bodies.rectangle(renderX, renderY, renderW, renderH, options);
             shapeBody.width = renderW;
             shapeBody.height = renderH;
        } else if (data.type === 'Text') {
             // Text Label (Sensor, Static)
             shapeBody = Bodies.rectangle(renderX, renderY, renderW, renderH, { ...commonOptions, isSensor: true, isStatic: true });
             shapeBody.width = renderW;
             shapeBody.height = renderH;
        } else if (data.type === 'Polygon') {
            // Polygon
            const radius = Math.max(renderW, renderH) / 2;
            shapeBody = Bodies.polygon(renderX, renderY, data.sides, radius, commonOptions);
            
            if (Math.abs(renderW - renderH) > 0.1) {
                  const scaleX = renderW / (radius * 2);
                  const scaleY = renderH / (radius * 2);
                  Body.scale(shapeBody, scaleX, scaleY);
             }
             shapeBody.radius = radius; 
             shapeBody.width = renderW;
             shapeBody.height = renderH;
         } else if (data.type === 'Cone') {
            // Cone
            if (this.currentViewMode === 'side') {
                const w = renderW;
                const h = renderH;
                const vertices = [
                    { x: 0, y: -h/2 },
                    { x: w/2, y: h/2 },
                    { x: -w/2, y: h/2 }
                ];
                shapeBody = Bodies.fromVertices(renderX + offsetX, renderY + offsetY, [vertices], commonOptions);
            } else {
                const radius = Math.max(renderW, renderH) / 2;
                shapeBody = Bodies.circle(renderX, renderY, radius, commonOptions);
                
                if (Math.abs(renderW - renderH) > 0.1) {
                    const scaleX = renderW / (radius * 2);
                    const scaleY = renderH / (radius * 2);
                    Body.scale(shapeBody, scaleX, scaleY);
                }
                shapeBody.radius = radius;
                shapeBody.width = renderW;
                shapeBody.height = renderH;
            }
        }

        // 2. Decide on final body
        if (data.isPointMass) {
            // Create a tiny circle to represent Point Mass
            const radius = 2; // 2px radius
            body = Bodies.circle(renderX, renderY, radius, commonOptions);
            body.isPointMass = true; 
            
            // Attach visual properties from shapeBody
            if (shapeBody) {
                body.visualWidth = shapeBody.width;
                body.visualHeight = shapeBody.height;
                body.visualRadius = shapeBody.radius;
                body.visualVertices = shapeBody.vertices;
            }
        } else {
            body = shapeBody;
        }

        if (body) {
            if (data.mass) Body.setMass(body, data.mass);
            if (data.velocity) Body.setVelocity(body, data.velocity);
            Composite.add(this.world, body);
            this.entities[data.id] = body;
        }
    }

    /**
     * 更新物体属性
     * @param {string} id 
     * @param {object} updates { x, y, z, width, height, depth, mass, friction, restitution, angle, color, isStatic }
     */
    updateObject(id, updates) {
        const data = this.sceneData[id];
        if (!data) {
            // Check if it's a constraint
            if (this.customConstraints) {
                const constraint = this.customConstraints.find(c => c.id === id);
                if (constraint) {
                    Object.assign(constraint, updates);
                    return;
                }
            }
            console.warn(`[PhysicsEngine.updateObject] No data found for ${id}`);
            return;
        }

        // Merge updates
        Object.assign(data, updates);

        // Update current body if it exists
        const body = this.entities[id];
        if (body) {
            // Position
            let targetX, targetY;
            if (this.currentViewMode === 'side') {
                targetX = data.x;
                targetY = data.y;
                if (updates.angle !== undefined) Body.setAngle(body, updates.angle);
            } else {
                targetX = data.x;
                targetY = data.z;
                if (updates.angleTop !== undefined) Body.setAngle(body, updates.angleTop);
            }

            // Apply Offset to target Position
            if (this.currentViewMode === 'side' && (data.type === 'Triangle' || data.type === 'Incline' || data.type === 'Cone' || data.type === 'Trapezoid')) {
                const offset = this._getCenterOffset(data.type, data.width, data.height);
                targetX += offset.x;
                targetY += offset.y;
            }

            Body.setPosition(body, { x: targetX, y: targetY });

            // Dimensions (Re-creating body might be needed if dimensions change, 
            // but Matter.js doesn't support resizing rectangles easily without scaling)
            // For simplicity, we can use Body.scale or just recreate.
            // Recreating is safer for consistency.
            if (updates.width || updates.height || updates.depth || updates.radius || updates.sides || updates.isPointMass !== undefined) {
                this._recreateBody(id); 
            } else {
                // Properties
                if (updates.isStatic !== undefined) Body.setStatic(body, updates.isStatic);
                if (updates.mass !== undefined) Body.setMass(body, updates.mass);
                if (updates.friction !== undefined) body.friction = updates.friction;
                if (updates.frictionAir !== undefined) body.frictionAir = updates.frictionAir;
                if (updates.restitution !== undefined) body.restitution = updates.restitution;
                if (updates.velocity !== undefined) Body.setVelocity(body, updates.velocity);
                if (updates.color !== undefined) body.render.fillStyle = updates.color;
            }
        } else {
             console.warn(`[PhysicsEngine.updateObject] No body found for ${id}`);
        }
    }

    _recreateBody(id) {
        const data = this.sceneData[id];
        const oldBody = this.entities[id];
        if (oldBody) Composite.remove(this.world, oldBody);
        this._createBodyFromData(data);
    }

    /**
     * 删除指定物体
     * @param {string} id 
     */
    removeObject(id) {
        const body = this.entities[id];
        if (body) {
            Composite.remove(this.world, body);
            delete this.entities[id];
        }
        if (this.sceneData[id]) {
            delete this.sceneData[id];
        }
    }

    createObject(id, data) {
        this.sceneData[id] = { ...data, id };
        this._createBodyFromData(this.sceneData[id]);
    }

    /**
     * 创建通用矩形块
     */
    createBlock(id, { x, y, z, width, height, depth, color = '#3498db', isStatic = false, label = 'Box', ...extras }) {
        this.createObject(id, {
            type: label === 'Ground' || label === 'Wall' ? label : 'Box',
            x, y, z, width, height, depth, color, isStatic, ...extras
        });
    }

    /**
     * 创建球体
     */
    createBall(id, { x, y, z, radius, color = '#e74c3c', ...extras }) {
        this.createObject(id, {
            type: 'Circle',
            x, y, z, radius, color, width: radius * 2, height: radius * 2, depth: radius * 2, ...extras
        });
    }

    /**
     * 创建圆锥
     */
    createCone(id, { x, y, z, radius, height, color = '#f1c40f', ...extras }) {
        this.createObject(id, {
            type: 'Cone',
            x, y, z, radius, height, color, width: radius * 2, depth: radius * 2, ...extras
        });
    }

    /**
     * 创建斜面
     */
    createIncline(id, { x, y, z, width, height, depth, color = '#95a5a6', ...extras }) {
        this.createObject(id, {
            type: 'Incline',
            x, y, z, width, height, depth, color, isStatic: true, ...extras
        });
    }

    /**
     * 创建多边形
     */
    createPolygon(id, { x, y, z, sides, radius, color = '#9b59b6', ...extras }) {
        this.createObject(id, {
            type: 'Polygon',
            x, y, z, sides, radius, color, width: radius * 2, height: radius * 2, depth: radius * 2, ...extras
        });
    }

    /**
     * Create Text Label
     */
    createText(id, { x, y, z, text = "Label", fontSize = 20, color = '#333333', ...extras }) {
        this.createObject(id, {
            type: 'Text',
            x, y, z, text, fontSize, color, width: text.length * fontSize * 0.6, height: fontSize, isStatic: true, isSensor: true, ...extras
        });
    }

    /**
     * 创建弹簧 (Spring)
     */
    createSpring(id, params) {
        const { bodyAId, bodyBId, pointA, pointB, length, stiffness = 0.01, damping = 0.1, isLight = true, mass, style, coilCount = 10, amplitude = 8 } = params;
        
        const springData = {
            id,
            type: 'spring',
            bodyAId, bodyBId,
            pointA: pointA || { x: 0, y: 0 },
            pointB: pointB || { x: 0, y: 0 },
            length: length,
            stiffness, damping, isLight, mass,
            coilCount, amplitude,
            style: style || { strokeStyle: '#27ae60', lineWidth: 2, type: 'spring' }
        };

        if (!this.customConstraints) this.customConstraints = [];
        this.customConstraints.push(springData);
        
        return springData;
    }

    /**
     * 创建理想绳索 (Ideal Rope) - Simplified for 3D refactor first pass
     */
    createIdealRope(id, params) {
        // Rope logic needs 3D coordinates. For now, we store it but maybe only render in Side View.
        // Or we project it.
        const { bodyAId, bodyBId, pointA, pointB, length, maxForce, isElastic = false, stiffness = 0.5, isLight = true, mass, style } = params;
        
        const ropeData = {
            id,
            type: 'ideal_rope',
            bodyAId, bodyBId, // Store IDs instead of body references for persistence
            pointA: pointA || { x: 0, y: 0 },
            pointB: pointB || { x: 0, y: 0 },
            length: length,
            maxForce, isElastic, stiffness, isLight, mass,
            style: style || { strokeStyle: '#e67e22', lineWidth: 2 }
        };

        if (!this.customConstraints) this.customConstraints = [];
        this.customConstraints.push(ropeData);
        
        return ropeData;
    }

    /**
     * 创建滑轮组 (Pulley)
     */
    createPulley(id, params) {
        const { bodyAId, bodyBId, pointA, pointB, pointC, pointD, stiffness = 1, length, isLight = true, mass } = params;
        
        // Pulley usually involves 2 bodies and 2 fixed points (or body anchor points).
        // Let's assume structure: BodyA --- PointA (Pulley1) --- PointB (Pulley2) --- BodyB
        // Length = |BodyA-PointA| + |BodyB-PointB|
        
        // If length is not provided, calculate current length
        let totalLength = length;
        if (!totalLength) {
             // Need positions... tricky if bodies not created yet or just IDs passed.
             // We can defer length calculation to first update if needed, but better to have it.
             // For now, assume user provides length or we calculate if bodies exist.
             totalLength = 200; // Default fallback
        }

        const pulleyData = {
            id,
            type: 'pulley',
            bodyAId, bodyBId,
            pointA: pointA || { x: -50, y: -100 }, // Anchor on Body A (or world)
            pointB: pointB || { x: 50, y: -100 },  // Anchor on Body B (or world)
            pointC: pointC || { x: -50, y: -200 }, // Fixed Pulley 1
            pointD: pointD || { x: 50, y: -200 },  // Fixed Pulley 2
            length: totalLength,
            stiffness, isLight, mass,
            style: { strokeStyle: '#8e44ad', lineWidth: 2 }
        };

        if (!this.customConstraints) this.customConstraints = [];
        this.customConstraints.push(pulleyData);
        return pulleyData;
    }

    /**
     * Create Constant Force
     */
    createForce(id, { bodyId, vector, color = '#e74c3c' }) {
        const forceData = {
            id,
            type: 'force',
            bodyAId: bodyId,
            vector: vector || { x: 0, y: 0 },
            color
        };
        if (!this.customConstraints) this.customConstraints = [];
        this.customConstraints.push(forceData);
        return forceData;
    }

    /**
     * Create Friction Constraint
     */
    createFrictionConstraint(id, params) {
        const { bodyAId, bodyBId, friction } = params;
        const frictionData = {
            id,
            type: 'friction',
            bodyAId,
            bodyBId,
            friction: parseFloat(friction) || 0.1,
            style: { strokeStyle: '#f1c40f', lineWidth: 2, lineDash: [5, 5] }
        };
        
        if (!this.customConstraints) this.customConstraints = [];
        this.customConstraints.push(frictionData);
        return frictionData;
    }

    /**
     * 获取当前场景状态 (Snapshot)
     */
    getState() {
        return {
            sceneData: JSON.parse(JSON.stringify(this.sceneData)),
            customConstraints: JSON.parse(JSON.stringify(this.customConstraints || [])),
            gravity: { ...this.engine.world.gravity }
        };
    }

    /**
     * 恢复场景状态
     */
    restoreState(state) {
        if (!state) return;
        this.clear();
        this.sceneData = state.sceneData || {};
        this.customConstraints = state.customConstraints || [];
        if (state.gravity) {
            this.engine.world.gravity.y = state.gravity.y;
            this.engine.world.gravity.x = state.gravity.x;
        }
        this.rebuildWorld();
    }

    /**
     * 切割物体 (Cut Object)
     * @param {object} p1 Start point {x, y}
     * @param {object} p2 End point {x, y}
     */
    cutObject(p1, p2) {
        // 1. Find bodies intersecting the line
        const bodies = Composite.allBodies(this.world).filter(b => !b.isStatic);
        const rayCollisions = Query.ray(bodies, p1, p2);
        
        // Use a Set to avoid duplicate processing if multiple parts of same concave body hit (though we use convex mostly)
        const hitBodies = new Set(rayCollisions.map(c => c.body));

        hitBodies.forEach(body => {
            // Check if it's a supported shape (Polygon/Rect/Cone/Triangle)
            // We can check sceneData type
            const id = body.plugin.userLabel;
            const data = this.sceneData[id];
            if (!data) return;

            // Only support polygons for now (Rect, Triangle, Polygon, Cone-Side)
            // Circle cutting is harder (requires converting to polygon first or creating semi-circles)
            // For now, let's try to slice whatever vertices we have.
            
            this._sliceBody(body, p1, p2, data);
        });
    }

    _sliceBody(body, p1, p2, data) {
        const vertices = body.vertices;
        const intersections = [];
        
        // Calculate intersections with all edges
        for (let i = 0; i < vertices.length; i++) {
            const v1 = vertices[i];
            const v2 = vertices[(i + 1) % vertices.length];
            
            const intersection = this._getLineIntersection(p1, p2, v1, v2);
            if (intersection) {
                intersections.push({ point: intersection, index: i });
            }
        }

        // We need exactly 2 intersections to split a convex polygon effectively
        if (intersections.length !== 2) return;

        // Sort intersections by index to ensure order
        intersections.sort((a, b) => a.index - b.index);
        
        const [int1, int2] = intersections;
        
        // Construct new vertices lists
        const verticesA = [];
        const verticesB = [];

        // Part A: Start from int1, go to int2, then close back to int1
        verticesA.push(int1.point);
        for (let i = int1.index + 1; i <= int2.index; i++) {
            verticesA.push(vertices[i % vertices.length]);
        }
        verticesA.push(int2.point);

        // Part B: Start from int2, go to int1 (wrapping around), then close back to int2
        verticesB.push(int2.point);
        for (let i = int2.index + 1; i < vertices.length + int1.index + 1; i++) {
            verticesB.push(vertices[i % vertices.length]);
        }
        verticesB.push(int1.point);

        // Remove old body
        this.removeObject(data.id);

        // Create new bodies
        // We need to calculate centroids to place them correctly? 
        // Matter.Bodies.fromVertices centers the body.
        // So we need to compute the center of mass of the new vertices to position the body correctly.
        // Actually, Bodies.fromVertices takes (x, y) and vertices. It will center the vertices at (x,y).
        // So we should compute the centroid of verticesA, use that as (x,y).
        
        // Calculate cut line normal for separation
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const normal = len > 0 ? { x: -dy / len, y: dx / len } : { x: 0, y: 0 };
        const separation = 2.0; // Separation distance

        const createPart = (verts, suffix) => {
            const centroid = Vertices.centre(verts);
            
            // Determine side of cut line to shift away
            const vec = { x: centroid.x - p1.x, y: centroid.y - p1.y };
            const dot = vec.x * normal.x + vec.y * normal.y;
            const shift = dot >= 0 ? separation : -separation;
            
            const newX = centroid.x + normal.x * shift;
            const newY = centroid.y + normal.y * shift;
            
            const newId = data.id + suffix;
            
            // We need to preserve z, depth, color etc.
            const newData = {
                ...data,
                id: newId,
                type: 'Polygon', // Converted to generic polygon
                x: newX,
                y: newY,
                // Dimensions are now implicit in vertices. 
                // We might lose 'width/height' exactness for UI but that's fine for cut pieces.
                // We should store vertices in sceneData to persist them?
                // sceneData usually stores parametric data (w, h). 
                // For custom polygons, we need to store 'vertices' or 'sides/radius'.
                // Our current createPolygon uses sides/radius.
                // We need a 'CustomPolygon' type in sceneData that stores raw vertices.
                customVertices: verts.map(v => ({ x: v.x - centroid.x, y: v.y - centroid.y })), // Relative to geometric center
                isStatic: false // Cut pieces usually fall
            };
            
            // Add to sceneData
            this.sceneData[newId] = newData;
            
            // Create Body
            const body = Bodies.fromVertices(newX, newY, [verts], {
                isStatic: false,
                render: { fillStyle: data.color },
                label: 'Polygon',
                plugin: { userLabel: newId }
            });
            
            if (body) {
                if (data.mass) Body.setMass(body, data.mass / 2); // Split mass roughly
                Composite.add(this.world, body);
                this.entities[newId] = body;
            }
        };

        createPart(verticesA, '_A');
        createPart(verticesB, '_B');
    }

    _getLineIntersection(p1, p2, p3, p4) {
        const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
        
        const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
        if (denom === 0) return null;
        
        const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
        const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
        
        if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
            return {
                x: x1 + ua * (x2 - x1),
                y: y1 + ua * (y2 - y1)
            };
        }
        return null;
    }

    /**
     * 创建传送带
     */
    createConveyorBelt(id, { x, y, z, width, height, depth, speed, color = '#2c3e50' }) {
        this.createObject(id, {
            type: 'Conveyor',
            x, y, z, width, height, depth, color, isStatic: true, speed
        });
    }
    
    _registerCollisionEvents() {
        Matter.Events.on(this.engine, 'collisionActive', (event) => {
            // 这里可以保留部分逻辑，但主要的传送带逻辑已移至 _solveConveyorBelts
        });
    }

    /**
     * 内部方法：注册自定义物理更新逻辑
     */
    isRegionFree(x, y, width, height, type = 'Rectangle', excludeId = null) {
        // Advanced overlap check using Matter.js SAT (Separating Axis Theorem)
        // This ensures actual shape collision is checked, not just AABB.
        
        let testBody;
        const options = { isStatic: true }; // Make test body static to avoid gravity effects if any (though not added to world)

        // Create appropriate test body based on type
        if (type === 'Circle' || type === 'Cone') {
            const radius = Math.max(width, height) / 2;
            testBody = Matter.Bodies.circle(x, y, radius, options);
        } else if (type === 'Polygon') {
             // Use 5 sides as default for generic polygon check, or approximate with circle
             testBody = Matter.Bodies.polygon(x, y, 5, width / 2, options);
        } else if (type === 'Trapezoid') {
             testBody = Matter.Bodies.trapezoid(x, y, width, height, 0.5, options);
        } else if (type === 'Triangle' || type === 'Incline') {
            // Right triangle approximation for check
            const vertices = [
                { x: 0, y: height },
                { x: width, y: height },
                { x: width, y: 0 }
            ];
            // Bodies.fromVertices centers the body, so we need to adjust position?
            // Actually, Bodies.fromVertices(x,y,...) places center of mass at x,y.
            // Our editor places objects by bounding box center usually?
            // If we use simple rectangle for Triangle, it's safer than complex offset logic here.
            // But if user wants accuracy, let's use Rectangle for now for irregular shapes to be safe,
            // OR use Circle if it's compact.
            // Let's stick to Rectangle for Triangle to ensure enough space.
            testBody = Matter.Bodies.rectangle(x, y, width, height, options);
        } else {
            // Rectangle, Box, Ground, Wall, Conveyor, Capsule (approx)
            testBody = Matter.Bodies.rectangle(x, y, width, height, options);
        }

        // 2. Iterate over all existing bodies
        const bodies = Matter.Composite.allBodies(this.world);
        
        for (const body of bodies) {
             const id = body.plugin.userLabel;
             if (id === excludeId) continue;
             
             // Check collision
             if (!testBody || !body) continue;
             const collision = Matter.SAT.collides(testBody, body);
             
             if (collision && collision.collided) {
                 // Check overlap depth.
                 // If depth is very small (e.g. just touching), we might allow it?
                 // User said "Prevent volume overlap".
                 // Usually creation snapping puts objects touching.
                 // If we strictly forbid collision.collided, we can't place blocks on ground.
                 // So we should check overlap > tolerance.
                 
                 // However, for static-static, we might allow.
                 // But testBody is transient.
                 
                 // If the collision is with a static body (like Ground), and the overlap is small, allow it?
                 // Or if it's purely "touching".
                 // Matter.SAT doesn't give "isTouching". It gives "collided".
                 // But it gives "overlap" (vector) or "depth".
                 
                 // Let's assume a small tolerance for "touching".
                 const overlap = collision.overlap || 0;
                 if (overlap < 0.5) continue; // Allow very slight overlap (touching)
                 
                 return false;
             }
        }
        
        return true;
    }

    _registerCustomUpdate() {
        if (this.hasRegisteredEvents) return;

        Matter.Events.on(this.engine, 'beforeUpdate', () => {
            // 1. Resolve Constraints
            // Separate Position-Based (Iterative) and Force-Based (Single Step) constraints

            // A. Force-Based Solvers (Springs, Elastic Ropes) - Run Once
            if (this.customConstraints) {
                this.customConstraints.forEach(cons => {
                    if (cons.type === 'friction') return;

                    // Resolve references
                    const constraint = { ...cons };
                    constraint.bodyA = constraint.bodyAId ? this.entities[constraint.bodyAId] : null;
                    constraint.bodyB = constraint.bodyBId ? this.entities[constraint.bodyBId] : null;

                    // Validate bodies (basic check)
                    if ((constraint.bodyAId && !constraint.bodyA) || (constraint.bodyBId && !constraint.bodyB)) {
                        return; // Skip if referenced bodies are missing
                    }

                    if (cons.type === 'spring') {
                        this._solveSpring(constraint);
                    } else if (cons.type === 'ideal_rope' && cons.isElastic) {
                        this._solveIdealRope(constraint); // Elastic rope uses forces
                    } else if (cons.type === 'force') {
                        if (constraint.bodyA) {
                             Matter.Body.applyForce(constraint.bodyA, constraint.bodyA.position, constraint.vector);
                        }
                    }
                    // Pulleys moved to PBD for stability (unless explicitly elastic, but we assume ideal for now)
                });
            }

            // B. Position-Based Solvers (Ideal Ropes, Ideal Pulleys) - Run Multiple Iterations
            const iterations = 10; // Increased iterations for better stability
            for (let i = 0; i < iterations; i++) {
                if (this.customConstraints) {
                    this.customConstraints.forEach(cons => {
                        const constraint = { ...cons };
                        constraint.bodyA = constraint.bodyAId ? this.entities[constraint.bodyAId] : null;
                        constraint.bodyB = constraint.bodyBId ? this.entities[constraint.bodyBId] : null;

                         // Validate bodies
                        if ((constraint.bodyAId && !constraint.bodyA) || (constraint.bodyBId && !constraint.bodyB)) {
                            return; 
                        }

                        if (cons.type === 'ideal_rope' && !cons.isElastic) {
                            this._solveIdealRope(constraint);
                        } else if (cons.type === 'pulley') {
                            this._solveIdealPulley(constraint);
                        }
                    });
                }
            }
        });

        // 2. Collision Handling (Friction Constraints + Conveyor Belts)
        const handleCollisions = (event) => {
             const pairs = event.pairs;
             if (!pairs || pairs.length === 0) return;

             const frictionConstraints = this.customConstraints ? this.customConstraints.filter(c => c.type === 'friction') : [];
             
             pairs.forEach(pair => {
                 const bodyA = pair.bodyA;
                 const bodyB = pair.bodyB;
                 
                 // Skip if bodies don't have user labels (internal bodies?)
                 if (!bodyA.plugin || !bodyB.plugin) return;

                 const idA = bodyA.plugin.userLabel;
                 const idB = bodyB.plugin.userLabel;

                 if (!idA || !idB) return;

                 // --- A. Friction Constraints ---
                 if (frictionConstraints.length > 0) {
                     const constraint = frictionConstraints.find(c => 
                         (c.bodyAId === idA && c.bodyBId === idB) || 
                         (c.bodyAId === idB && c.bodyBId === idA)
                     );

                     if (constraint) {
                         // Override friction for this pair
                         pair.friction = constraint.friction;
                         pair.frictionStatic = constraint.friction; 
                     }
                 }

                 // --- B. Conveyor Belts ---
                 // Check if one of the bodies is a Conveyor
                 const dataA = this.sceneData[idA];
                 const dataB = this.sceneData[idB];
                 
                 let conveyorBody, targetBody, conveyorData;
                 
                 if (dataA && dataA.type === 'Conveyor') {
                     conveyorBody = bodyA; conveyorData = dataA; targetBody = bodyB;
                 } else if (dataB && dataB.type === 'Conveyor') {
                     conveyorBody = bodyB; conveyorData = dataB; targetBody = bodyA;
                 }

                 if (conveyorBody && targetBody && !targetBody.isStatic) {
                      // Apply Conveyor Force
                      const speed = conveyorData.conveyorSpeed || 5; 
                      
                      // Calculate belt direction vector
                      // Note: body.angle is in radians
                      const angle = conveyorBody.angle;
                      const dir = { x: Math.cos(angle), y: Math.sin(angle) };
                      
                      // Calculate relative velocity along the belt direction
                      // v_rel = v_body . dir
                      const vAlongBelt = Vector.dot(targetBody.velocity, dir);
                      
                      // Difference from target speed
                      const diff = vAlongBelt - speed;
                      
                      // Force magnitude: proportional to difference (P-controller)
                      // Scaled by mass to ensure consistent acceleration regardless of size
                      // Scaled by friction to simulate grip
                      const friction = conveyorBody.friction * targetBody.friction;
                      const k = 0.5; // Gain factor
                      
                      const forceMag = -diff * k * targetBody.mass * (friction > 0 ? friction : 0.1);
                      
                      const force = Vector.mult(dir, forceMag);
                      
                      // Apply force at the contact point(s) to simulate realistic grip and torque
                      const contacts = pair.activeContacts;
                      if (contacts && contacts.length > 0) {
                          // Apply distributed force or at average contact point
                          // For simplicity and stability, applying at the first contact or average is often enough.
                          // Let's use the average contact point.
                          let contactX = 0, contactY = 0;
                          contacts.forEach(c => {
                              contactX += c.vertex.x;
                              contactY += c.vertex.y;
                          });
                          const contactPoint = { x: contactX / contacts.length, y: contactY / contacts.length };
                          
                          Matter.Body.applyForce(targetBody, contactPoint, force);
                      } else {
                          // Fallback to center if no contacts found (rare in collisionActive)
                          Matter.Body.applyForce(targetBody, targetBody.position, force);
                      }
                 }
             });
        };

        Matter.Events.on(this.engine, 'collisionStart', handleCollisions);
        Matter.Events.on(this.engine, 'collisionActive', handleCollisions);
        
        // After Update: Record Trajectories
        Matter.Events.on(this.engine, 'afterUpdate', () => {
             Object.keys(this.entities).forEach(id => {
                 const body = this.entities[id];
                 const data = this.sceneData[id];
                 if (body && data && data.showTrajectory) {
                     if (!this.trajectories[id]) this.trajectories[id] = [];
                     
                     // Add point if moved significantly
                    const lastPoint = this.trajectories[id][this.trajectories[id].length - 1];
                    const currentPoint = { x: body.position.x, y: body.position.y };
                    
                    // Optimization: Increase minimum distance to 10px (squared 100) to reduce point count
                    if (!lastPoint || Vector.magnitudeSquared(Vector.sub(lastPoint, currentPoint)) > 100) { 
                        this.trajectories[id].push(currentPoint);
                        // Limit length
                        if (this.trajectories[id].length > 500) {
                            this.trajectories[id].shift();
                        }
                    }
                 }
             });
        });

        this.hasRegisteredEvents = true;
    }

    _solveConveyorBelts() {
        // Deprecated: Logic moved to handleCollisions for efficiency
    }

    _solveIdealRope(rope) {
        // Validation handled in loop, but double check
        if (!rope.bodyA && !rope.bodyB) return;

        // Calculate World Points (rotate local offsets)
        let posA, posB;

        if (rope.bodyA) {
            const offsetA = Vector.rotate(rope.pointA, rope.bodyA.angle);
            posA = Vector.add(rope.bodyA.position, offsetA);
        } else {
            posA = rope.pointA;
        }

        if (rope.bodyB) {
            const offsetB = Vector.rotate(rope.pointB, rope.bodyB.angle);
            posB = Vector.add(rope.bodyB.position, offsetB);
        } else {
            posB = rope.pointB;
        }

        const diffVec = Vector.sub(posB, posA);
        const currentDist = Vector.magnitude(diffVec);

        // Safety: Avoid NaN or Infinity
        if (!Number.isFinite(currentDist)) return;

        if (rope.isElastic) {
            // Elastic Rope (behaves like a spring but only in tension)
            if (currentDist > rope.length) {
                const diff = currentDist - rope.length;
                
                // Normalization safety
                let normal;
                if (currentDist > 0.0001) {
                    normal = Vector.div(diffVec, currentDist);
                } else {
                    normal = { x: 0, y: 0 };
                }

                const forceMag = (rope.stiffness || 0.5) * diff;
                
                // Check Max Tension
                if (rope.maxForce && forceMag > rope.maxForce) {
                    this._removeConstraint(rope.id);
                    return;
                }

                const force = Vector.mult(normal, forceMag);
                
                if (rope.bodyA && !rope.bodyA.isStatic) {
                    Matter.Body.applyForce(rope.bodyA, posA, force);
                }
                if (rope.bodyB && !rope.bodyB.isStatic) {
                    Matter.Body.applyForce(rope.bodyB, posB, Vector.neg(force));
                }
            }
        } else {
            // Ideal Rope (Distance Constraint) - Position Based Dynamics
            if (currentDist > rope.length) {
                const diff = currentDist - rope.length;
                
                // Check break condition
                if (rope.maxForce && diff > rope.maxForce * 0.1) { 
                     this._removeConstraint(rope.id);
                     return;
                }

                // Normalization safety
                let normal;
                if (currentDist > 0.0001) {
                    normal = Vector.div(diffVec, currentDist);
                } else {
                    normal = { x: 0, y: 0 };
                }

                const correction = Vector.mult(normal, diff);
                
                let totalInverseMass = 0;
                if (rope.bodyA && !rope.bodyA.isStatic) totalInverseMass += rope.bodyA.inverseMass;
                if (rope.bodyB && !rope.bodyB.isStatic) totalInverseMass += rope.bodyB.inverseMass;

                if (totalInverseMass > 0) {
                    // Stiffness factor (0.1 - 1.0). 
                    // Higher value = rigid.
                    const k = rope.stiffness ? Math.min(Math.max(rope.stiffness, 0.1), 1.0) : 0.8;
                    
                    if (rope.bodyA && !rope.bodyA.isStatic) {
                        const ratio = rope.bodyA.inverseMass / totalInverseMass;
                        const move = Vector.mult(correction, ratio * k);
                        
                        // Safety cap on movement to prevent massive tunneling (50px per frame limit)
                        if (Vector.magnitudeSquared(move) < 2500) { 
                            Matter.Body.translate(rope.bodyA, move);
                            
                            // Velocity correction (damping)
                            const vel = rope.bodyA.velocity;
                            const velAlongNormal = Vector.dot(vel, normal);
                            if (velAlongNormal < 0) {
                                // Damp velocity moving away from constraint
                                const correctionVel = Vector.mult(normal, velAlongNormal * 0.5);
                                Matter.Body.setVelocity(rope.bodyA, Vector.sub(vel, correctionVel));
                            }
                        }
                    }
                    
                    if (rope.bodyB && !rope.bodyB.isStatic) {
                        const ratio = rope.bodyB.inverseMass / totalInverseMass;
                        const move = Vector.mult(correction, -ratio * k);

                        // Safety cap (50px per frame limit)
                        if (Vector.magnitudeSquared(move) < 2500) {
                            Matter.Body.translate(rope.bodyB, move);

                            const vel = rope.bodyB.velocity;
                            const velAlongNormal = Vector.dot(vel, normal);
                            if (velAlongNormal > 0) {
                                 const correctionVel = Vector.mult(normal, velAlongNormal * 0.5);
                                 Matter.Body.setVelocity(rope.bodyB, Vector.sub(vel, correctionVel));
                            }
                        }
                    }
                }
            }
        }
    }

    _removeConstraint(id) {
        if (!this.customConstraints) return;
        this.customConstraints = this.customConstraints.filter(c => c.id !== id);
    }

    
    _solveSpring(spring) {
        if (!spring.bodyA && !spring.bodyB) return;

        // Calculate World Points (rotate local offsets)
        let posA, posB;

        if (spring.bodyA) {
            const offsetA = Vector.rotate(spring.pointA, spring.bodyA.angle);
            posA = Vector.add(spring.bodyA.position, offsetA);
        } else {
            posA = spring.pointA;
        }

        if (spring.bodyB) {
            const offsetB = Vector.rotate(spring.pointB, spring.bodyB.angle);
            posB = Vector.add(spring.bodyB.position, offsetB);
        } else {
            posB = spring.pointB;
        }

        const diffVec = Vector.sub(posB, posA);
        const currentDist = Vector.magnitude(diffVec);
        
        // Avoid instability at near-zero distance
        if (currentDist < 0.1 || !Number.isFinite(currentDist)) return;

        const diff = currentDist - spring.length;
        const normal = Vector.div(diffVec, currentDist); // Safe because dist >= 0.1
        
        // F = k * x
        const stiffness = spring.stiffness || 0.01;
        const damping = spring.damping || 0.1;
        
        const forceMagnitude = stiffness * diff;
        const force = Vector.mult(normal, forceMagnitude);
        
        // Damping
        let velA = spring.bodyA ? spring.bodyA.velocity : { x: 0, y: 0 };
        let velB = spring.bodyB ? spring.bodyB.velocity : { x: 0, y: 0 };
        const relVel = Vector.sub(velB, velA);
        const velAlongNormal = Vector.dot(relVel, normal);
        const dampingForce = Vector.mult(normal, velAlongNormal * damping);

        const totalForce = Vector.add(force, dampingForce);

        // Cap force to prevent explosion (Safety Guard)
        // Matter.js forces can be large, but infinite/NaN is bad.
        // A generous cap of 100000 ensures we don't break the physics world with bad inputs.
        const maxForceSq = 100000 * 100000; 
        if (Vector.magnitudeSquared(totalForce) > maxForceSq) {
             return;
        }

        if (spring.bodyA && !spring.bodyA.isStatic) {
            Matter.Body.applyForce(spring.bodyA, posA, totalForce);
        }
        if (spring.bodyB && !spring.bodyB.isStatic) {
            Matter.Body.applyForce(spring.bodyB, posB, Vector.neg(totalForce));
        }
    }
    
    _solveIdealPulley(pulley) {
        // Position Based Dynamics for Ideal Pulley
        const bodyA = pulley.bodyA;
        const bodyB = pulley.bodyB;
        if (!bodyA && !bodyB) return; 

        // Anchor points on bodies (world coords, rotated)
        let anchorA, anchorB;

        if (bodyA) {
            const offsetA = Vector.rotate(pulley.pointA, bodyA.angle);
            anchorA = Vector.add(bodyA.position, offsetA);
        } else {
            anchorA = pulley.pointA;
        }

        if (bodyB) {
            const offsetB = Vector.rotate(pulley.pointB, bodyB.angle);
            anchorB = Vector.add(bodyB.position, offsetB);
        } else {
            anchorB = pulley.pointB;
        }
        
        // Fixed pulley points (world coords)
        const pulleyA = pulley.pointC;
        const pulleyB = pulley.pointD;

        // Vectors from Pulley to Body
        const vecA = Vector.sub(anchorA, pulleyA);
        const vecB = Vector.sub(anchorB, pulleyB);
        
        const lenA = Vector.magnitude(vecA);
        const lenB = Vector.magnitude(vecB);
        
        if (!Number.isFinite(lenA) || !Number.isFinite(lenB)) return;

        const currentLen = lenA + lenB;
        
        if (currentLen > pulley.length) {
            const diff = currentLen - pulley.length;
            
            // Gradients (directions that increase length)
            // nA points from PulleyA to AnchorA
            const nA = lenA > 0.001 ? Vector.div(vecA, lenA) : { x: 0, y: 0 };
            const nB = lenB > 0.001 ? Vector.div(vecB, lenB) : { x: 0, y: 0 };
            
            let wA = (bodyA && !bodyA.isStatic) ? bodyA.inverseMass : 0;
            let wB = (bodyB && !bodyB.isStatic) ? bodyB.inverseMass : 0;
            
            const totalInverseMass = wA + wB;
            if (totalInverseMass === 0) return;

            // Stiffness (0.0 - 1.0)
            // For PBD, k=1.0 means full correction. Lower values reduce jitter.
            const k = pulley.stiffness ? Math.min(Math.max(pulley.stiffness, 0.1), 1.0) : 0.8;
            
            // Calculate correction magnitude
            // delta_lambda = -C / sum(w_i)
            const lambda = -diff / totalInverseMass * k;
            
            // Apply corrections
            if (bodyA && !bodyA.isStatic) {
                const correctionA = Vector.mult(nA, lambda * wA);
                // Move opposite to gradient to reduce length
                // Since lambda is negative (because diff is positive), we add lambda * nA
                // Wait, if length is too long (diff > 0), we want to pull bodies closer to pulleys.
                // nA points AWAY from pulley.
                // We want to move towards pulley (-nA).
                // Formula: delta_x = w * lambda * grad_C
                // grad_C is nA.
                // lambda is -diff/w.
                // So delta_x is w * (-diff/w) * nA = -diff * (w/W) * nA.
                // Correct.
                
                // Safety cap
                if (Vector.magnitudeSquared(correctionA) < 2500) {
                     Matter.Body.translate(bodyA, correctionA);
                     
                     // Velocity correction (damping)
                     const velAlong = Vector.dot(bodyA.velocity, nA);
                     if (velAlong > 0) {
                         // Remove velocity component moving away from pulley
                         const damping = Vector.mult(nA, velAlong * 0.5); // 0.5 damping factor
                         Matter.Body.setVelocity(bodyA, Vector.sub(bodyA.velocity, damping));
                     }
                }
            }
            
            if (bodyB && !bodyB.isStatic) {
                const correctionB = Vector.mult(nB, lambda * wB);
                
                if (Vector.magnitudeSquared(correctionB) < 2500) {
                     Matter.Body.translate(bodyB, correctionB);

                     const velAlong = Vector.dot(bodyB.velocity, nB);
                     if (velAlong > 0) {
                         const damping = Vector.mult(nB, velAlong * 0.5);
                         Matter.Body.setVelocity(bodyB, Vector.sub(bodyB.velocity, damping));
                     }
                }
            }
        }
    }

    /**
     * Create Interaction Constraint (Mouse Drag)
     */
    createInteractionConstraint(bodyId, point) {
        const body = this.entities[bodyId];
        if (!body) return null;

        const constraintId = `interaction-${bodyId}`;
        // Remove existing if any
        this._removeConstraint(constraintId);

        // Calculate offset from center in local body space (unrotated)
        // Offset_world = point - body.position
        // Offset_local = rotate(Offset_world, -body.angle)
        const offsetWorld = Vector.sub(point, body.position);
        const offsetLocal = Vector.rotate(offsetWorld, -body.angle);

        const constraint = {
            id: constraintId,
            type: 'spring',
            bodyA: body,
            pointA: offsetLocal, // Local unrotated offset
            pointB: point,  // World position (Mouse)
            length: 0,
            stiffness: 0.1,
            damping: 0.1,
            render: { visible: false }
        };

        if (!this.customConstraints) this.customConstraints = [];
        this.customConstraints.push(constraint);
        return constraintId;
    }

    updateInteractionConstraint(constraintId, point) {
        if (!this.customConstraints) return;
        const constraint = this.customConstraints.find(c => c.id === constraintId);
        if (constraint) {
            constraint.pointB = point;
        }
    }

    removeInteractionConstraint(constraintId) {
        this._removeConstraint(constraintId);
    }

    clearTrajectory(id) {
        if (this.trajectories && this.trajectories[id]) {
            this.trajectories[id] = [];
        }
    }

    /**
     * Set global engine properties
     */
    setEngineProperties(props) {
        if (props.gravity) {
            if (props.gravity.x !== undefined) this.engine.world.gravity.x = props.gravity.x;
            if (props.gravity.y !== undefined) this.engine.world.gravity.y = props.gravity.y;
        }
        if (props.timeScale !== undefined) {
            this.engine.timing.timeScale = props.timeScale;
        }
        if (props.airResistance !== undefined) {
             this.globalAirResistance = props.airResistance;
             const bodies = Composite.allBodies(this.world);
             bodies.forEach(body => {
                 if (!body.isStatic) {
                     body.frictionAir = props.airResistance;
                 }
             });
        }
    }

    /**
     * Get telemetry data for visualization
     */
    getTelemetry() {
        const bodies = Composite.allBodies(this.world);
        const telemetry = {};
        
        bodies.forEach(body => {
            if (!body.plugin || !body.plugin.userLabel) return;
            const id = body.plugin.userLabel;
            
            telemetry[id] = {
                velocity: { ...body.velocity },
                position: { ...body.position },
                angle: body.angle,
                angularVelocity: body.angularVelocity,
                speed: body.speed,
                // Note: Matter.js clears force after every update, so we might only capture it 
                // if we call this inside an event or before update clears it. 
                // However, for visualization, velocity/accel is more useful.
                // We can estimate acceleration from previous velocity if needed, 
                // but the editor loop already does that.
                force: { ...body.force } 
            };
        });
        
        return telemetry;
    }
}

export default PhysicsSceneBuilder;
