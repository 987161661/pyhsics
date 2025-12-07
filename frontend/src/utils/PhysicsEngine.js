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
        this.world = this.engine.world;
        
        // 存储所有创建的实体，方便后续查找
        this.entities = {}; // Mapping ID -> Matter.Body
        this.sceneData = {}; // Mapping ID -> { x, y, z, width, height, depth, type, ... }
        this.customConstraints = [];
        this.hasRegisteredEvents = false;
        this.hasRegisteredCollision = false;
        this.currentViewMode = 'side'; // 'side' | 'top'

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
            renderW = data.width;
            renderH = data.height;
        } else {
            renderX = data.x;
            renderY = data.z; // Map Z to visual Y
            renderW = data.width;
            renderH = data.depth; // Map Depth to visual Height
        }

        const commonOptions = {
            isStatic: data.isStatic,
            friction: data.friction,
            frictionAir: 0.01,
            angle: (this.currentViewMode === 'side' ? data.angle : (data.angleTop || 0)) || 0,
            render: { fillStyle: data.color },
            label: data.type,
            plugin: { userLabel: data.id }
        };

        // Apply Offset for shapes where CoM != BBox Center (e.g. Triangle in Side View)
        let offsetX = 0;
        let offsetY = 0;
        if (this.currentViewMode === 'side' && (data.type === 'Triangle' || data.type === 'Incline' || data.type === 'Cone' || data.type === 'Trapezoid')) {
             const offset = this._getCenterOffset(data.type, renderW, renderH);
             offsetX = offset.x;
             offsetY = offset.y;
        }

        if (data.type === 'Rectangle' || data.type === 'Box' || data.type === 'Ground' || data.type === 'Wall' || data.type === 'Conveyor') {
            body = Bodies.rectangle(renderX, renderY, renderW, renderH, commonOptions);
            // Store dimensions on body for renderer
            body.width = renderW;
            body.height = renderH;
        } else if (data.customVertices) {
            // Custom Polygon (e.g. from Cut)
            if (this.currentViewMode === 'side') {
                // In Side View, use vertices
                // Vertices are stored relative to center in data.customVertices? 
                // Or we can just use them.
                // In cutObject, we stored them as relative {x,y}.
                // Bodies.fromVertices expects vertices.
                body = Bodies.fromVertices(renderX, renderY, [data.customVertices], commonOptions);
            } else {
                // Top View: Projection
                // Complex polygons in top view are tricky. 
                // We'll just approximate as a circle or small rect for now, 
                // OR we can try to use the same vertices if it's a prism?
                // If it was cut in Side View, its Top View projection might be a rectangle (if it was a block).
                // Let's assume it's a prism with same depth.
                body = Bodies.rectangle(renderX, renderY, 50, data.depth || 50, commonOptions);
            }
        } else if (data.type === 'Circle') {
            // Circle in side view is circle. In top view, sphere is circle. 
            // Cylinder (standing up) in side is rect, top is circle.
            // Let's assume "Circle" is a Sphere.
            body = Bodies.circle(renderX, renderY, data.radius, commonOptions);
            body.radius = data.radius;
        } else if (data.type === 'Triangle' || data.type === 'Incline') {
             // Triangle (Ramp)
             // Side View: Triangle. Top View: Rectangle (Slope from top).
             if (this.currentViewMode === 'side') {
                // Ramp: Bottom-Left to Top-Right
                // Vertices order: Bottom-Left (0, h), Bottom-Right (w, h), Top-Right (w, 0)
                // This creates a ramp going UP to the RIGHT.
                const vertices = [
                    { x: 0, y: renderH },
                    { x: renderW, y: renderH },
                    { x: renderW, y: 0 }
                ];
                
                // Apply offset to body position so that the bounding box center aligns with renderX, renderY
                // renderX, renderY is where we want the center of the bounding box to be.
                // body.position will be set to (renderX + offsetX, renderY + offsetY)
                body = Bodies.fromVertices(renderX + offsetX, renderY + offsetY, [vertices], commonOptions);
             } else {
                 // Top View of a Ramp is a Rectangle
                 body = Bodies.rectangle(renderX, renderY, renderW, renderH, commonOptions);
                 body.width = renderW;
                 body.height = renderH;
             }
        } else if (data.type === 'Trapezoid') {
            // Trapezoid
            if (this.currentViewMode === 'side') {
                 // Bodies.trapezoid(x, y, width, height, slope, [options])
                 // slope < 1. 0.5 means 45 degrees usually.
                 body = Bodies.trapezoid(renderX, renderY, renderW, renderH, 0.5, commonOptions);
            } else {
                 // Top View of Trapezoid Prism is Rectangle
                 body = Bodies.rectangle(renderX, renderY, renderW, renderH, commonOptions);
                 body.width = renderW;
                 body.height = renderH;
            }
        } else if (data.type === 'Capsule') {
             // Capsule
             // Matter.js doesn't have direct Capsule, but we can make a rectangle with chamfer
             // Chamfer radius = height/2 (or width/2 depending on orientation)
             const radius = Math.min(renderW, renderH) / 2;
             const chamfer = { radius: [radius, radius, radius, radius] };
             
             // Merge options
             const options = { ...commonOptions, chamfer };
             
             body = Bodies.rectangle(renderX, renderY, renderW, renderH, options);
             body.width = renderW;
             body.height = renderH;
        } else if (data.type === 'Polygon') {
            // Polygon
            // Side View: Polygon. Top View: Polygon (Prism from top).
            // For now, assume uniform prism.
            body = Bodies.polygon(renderX, renderY, data.sides, data.radius, commonOptions);
            body.radius = data.radius; // Store for renderer
        } else if (data.type === 'Cone') {
            // Cone
            // Side View: Isosceles Triangle
            // Top View: Circle
            if (this.currentViewMode === 'side') {
                const w = data.radius * 2;
                const h = data.height || data.radius * 2;
                // Triangle vertices centered
                // Matter.Bodies.fromVertices centers the body.
                const vertices = [
                    { x: 0, y: -h/2 },
                    { x: w/2, y: h/2 },
                    { x: -w/2, y: h/2 }
                ];
                body = Bodies.fromVertices(renderX, renderY, [vertices], commonOptions);
            } else {
                body = Bodies.circle(renderX, renderY, data.radius, commonOptions);
                body.radius = data.radius;
            }
        }

        if (body) {
            if (data.mass) Body.setMass(body, data.mass);
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
            if (updates.width || updates.height || updates.depth || updates.radius || updates.sides) {
                this._recreateBody(id); 
            } else {
                // Properties
                if (updates.isStatic !== undefined) Body.setStatic(body, updates.isStatic);
                if (updates.mass !== undefined) Body.setMass(body, updates.mass);
                if (updates.friction !== undefined) body.friction = updates.friction;
                if (updates.restitution !== undefined) body.restitution = updates.restitution;
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
    createBlock(id, { x, y, z, width, height, depth, color = '#3498db', isStatic = false, label = 'Box' }) {
        this.createObject(id, {
            type: label === 'Ground' || label === 'Wall' ? label : 'Box',
            x, y, z, width, height, depth, color, isStatic
        });
    }

    /**
     * 创建球体
     */
    createBall(id, { x, y, z, radius, color = '#e74c3c' }) {
        this.createObject(id, {
            type: 'Circle',
            x, y, z, radius, color, width: radius * 2, height: radius * 2, depth: radius * 2
        });
    }

    /**
     * 创建圆锥
     */
    createCone(id, { x, y, z, radius, height, color = '#f1c40f' }) {
        this.createObject(id, {
            type: 'Cone',
            x, y, z, radius, height, color, width: radius * 2, depth: radius * 2
        });
    }

    /**
     * 创建斜面
     */
    createIncline(id, { x, y, z, width, height, depth, color = '#95a5a6' }) {
        this.createObject(id, {
            type: 'Incline',
            x, y, z, width, height, depth, color, isStatic: true // Ramps usually static? Or not. Let's default to static if it's "Ramp" tool, but user might want dynamic.
            // Actually PhysicsEditor doesn't pass isStatic for ramp. Let's default false unless specified.
        });
    }

    /**
     * 创建多边形
     */
    createPolygon(id, { x, y, z, sides, radius, color = '#9b59b6' }) {
        this.createObject(id, {
            type: 'Polygon',
            x, y, z, sides, radius, color, width: radius * 2, height: radius * 2, depth: radius * 2 // approx
        });
    }

    /**
     * 创建弹簧 (Spring)
     */
    createSpring(id, params) {
        const { bodyAId, bodyBId, pointA, pointB, length, stiffness = 0.01, damping = 0.1, isLight = true, mass, style } = params;
        
        const springData = {
            id,
            type: 'spring',
            bodyAId, bodyBId,
            pointA: pointA || { x: 0, y: 0 },
            pointB: pointB || { x: 0, y: 0 },
            length: length,
            stiffness, damping, isLight, mass,
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
        
        const createPart = (verts, suffix) => {
            const centroid = Vertices.centre(verts);
            const newId = data.id + suffix;
            
            // Need to shift vertices to be relative to centroid? 
            // Matter.js does this automatically if we pass the centroid as position.
            // But we need to pass the original vertices relative to world? 
            // Bodies.fromVertices documentation: "The vertices should be specified in world coordinates... 
            // ...or relative to the centre if the flag is set (it's not by default)."
            // Wait, usually it recenters them.
            // Let's rely on Matter.js to handle the centering.
            
            // We need to preserve z, depth, color etc.
            const newData = {
                ...data,
                id: newId,
                type: 'Polygon', // Converted to generic polygon
                x: centroid.x,
                y: centroid.y,
                // Dimensions are now implicit in vertices. 
                // We might lose 'width/height' exactness for UI but that's fine for cut pieces.
                // We should store vertices in sceneData to persist them?
                // sceneData usually stores parametric data (w, h). 
                // For custom polygons, we need to store 'vertices' or 'sides/radius'.
                // Our current createPolygon uses sides/radius.
                // We need a 'CustomPolygon' type in sceneData that stores raw vertices.
                customVertices: verts.map(v => ({ x: v.x - centroid.x, y: v.y - centroid.y })), // Relative
                isStatic: false // Cut pieces usually fall
            };
            
            // Add to sceneData
            this.sceneData[newId] = newData;
            
            // Create Body
            const body = Bodies.fromVertices(centroid.x, centroid.y, [verts], {
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
    isRegionFree(x, y, width, height, excludeId = null) {
        // Simple AABB check against sceneData
        // (x, y) is the center of the new object
        const halfW = width / 2;
        const halfH = height / 2;
        const minX = x - halfW;
        const maxX = x + halfW;
        const minY = y - halfH;
        const maxY = y + halfH;

        for (const id in this.sceneData) {
            if (id === excludeId) continue;
            const obj = this.sceneData[id];
            
            // Get obj bounds in current view
            // Note: For now we only check current view collision, which is what matters for user feedback
            let objX = obj.x;
            let objY = this.currentViewMode === 'side' ? obj.y : obj.z;
            let objW = obj.width || (obj.radius * 2) || 50;
            let objH = (this.currentViewMode === 'side' ? obj.height : obj.depth) || (obj.radius * 2) || 50;

            const oHalfW = objW / 2;
            const oHalfH = objH / 2;
            const oMinX = objX - oHalfW;
            const oMaxX = objX + oHalfW;
            const oMinY = objY - oHalfH;
            const oMaxY = objY + oHalfH;

            // AABB Overlap Check
            if (minX < oMaxX && maxX > oMinX && minY < oMaxY && maxY > oMinY) {
                return false;
            }
        }
        return true;
    }

    _registerCustomUpdate() {
        if (this.hasRegisteredEvents) return;

        Matter.Events.on(this.engine, 'beforeUpdate', () => {
            // 0. Sync Loop (Optional, or rely on setObjects in React)
            // We might want to sync continuously if we want real-time data view
            
            // 1. 处理自定义约束
            const iterations = 5;
            for (let i = 0; i < iterations; i++) {
                if (this.customConstraints) {
                    this.customConstraints.forEach(cons => {
                        // Need to resolve body references dynamically as bodies are recreated
                        const rope = { ...cons };
                        rope.bodyA = rope.bodyAId ? this.entities[rope.bodyAId] : null;
                        rope.bodyB = rope.bodyBId ? this.entities[rope.bodyBId] : null;

                        if (cons.type === 'ideal_rope') {
                            this._solveIdealRope(rope);
                        } else if (cons.type === 'spring') {
                            this._solveSpring(rope);
                        } else if (cons.type === 'pulley') {
                            this._solveIdealPulley(rope);
                        }
                    });
                }
            }

            // 2. 处理传送带
            this._solveConveyorBelts();
        });
        
        this.hasRegisteredEvents = true;
    }

    _solveConveyorBelts() {
        // Logic needs to find current bodies
        const belts = Object.values(this.entities).filter(e => {
             const data = this.sceneData[e.plugin.userLabel];
             return data && data.type === 'Conveyor';
        });
        if (belts.length === 0) return;

        const bodies = Composite.allBodies(this.world).filter(b => !b.isStatic);
        
        belts.forEach(belt => {
            const data = this.sceneData[belt.plugin.userLabel];
            const candidates = Matter.Query.region(bodies, belt.bounds);
            candidates.forEach(body => {
                const collision = Matter.Collision.collides(belt, body);
                if (collision && collision.collided) {
                    const speed = data.conveyorSpeed;
                    const beltDir = { x: Math.cos(belt.angle), y: Math.sin(belt.angle) };
                    const targetVel = Vector.mult(beltDir, speed);
                    const relVelX = body.velocity.x - targetVel.x;
                    const friction = belt.friction * body.friction; 
                    const k = 0.2 * 60 * friction; 
                    
                    Matter.Body.applyForce(body, body.position, {
                        x: -relVelX * k * body.mass * 0.001, 
                        y: 0
                    });

                    if (Math.abs(relVelX) > 0.1) {
                         Matter.Body.setVelocity(body, {
                             x: body.velocity.x - relVelX * 0.1,
                             y: body.velocity.y
                         });
                    }
                }
            });
        });
    }

    _solveIdealRope(rope) {
        if (!rope.bodyA && !rope.bodyB) return;

        const posA = rope.bodyA ? Vector.add(rope.bodyA.position, rope.pointA) : rope.pointA;
        const posB = rope.bodyB ? Vector.add(rope.bodyB.position, rope.pointB) : rope.pointB;

        const diffVec = Vector.sub(posB, posA);
        const currentDist = Vector.magnitude(diffVec);

        // Max Tension Check
        // We can estimate force based on correction or stiffness
        // If broken, we should remove it.
        // For now, let's just implement the mechanics.

        if (rope.isElastic) {
            // Elastic Rope (behaves like a spring but only in tension)
            if (currentDist > rope.length) {
                const diff = currentDist - rope.length;
                const normal = Vector.normalise(diffVec);
                const forceMag = (rope.stiffness || 0.5) * diff;
                
                // Check Max Tension
                if (rope.maxForce && forceMag > rope.maxForce) {
                    // Break rope
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
            // Ideal Rope (Distance Constraint)
            if (currentDist > rope.length + 0.1) {
                const diff = currentDist - rope.length;
                
                // Check approximate tension (Force ~ correction * mass / dt^2 ?)
                // Simplified check: if diff is huge, it breaks.
                if (rope.maxForce && diff > rope.maxForce * 0.1) { 
                     this._removeConstraint(rope.id);
                     return;
                }

                const normal = Vector.normalise(diffVec);
                const correction = Vector.mult(normal, diff);
                
                let totalInverseMass = 0;
                if (rope.bodyA && !rope.bodyA.isStatic) totalInverseMass += rope.bodyA.inverseMass;
                if (rope.bodyB && !rope.bodyB.isStatic) totalInverseMass += rope.bodyB.inverseMass;

                if (totalInverseMass > 0) {
                    const k = 0.95; 
                    
                    if (rope.bodyA && !rope.bodyA.isStatic) {
                        const ratio = rope.bodyA.inverseMass / totalInverseMass;
                        const move = Vector.mult(correction, ratio * k);
                        Matter.Body.translate(rope.bodyA, move);
                        
                        const vel = rope.bodyA.velocity;
                        const velAlongNormal = Vector.dot(vel, normal);
                        if (velAlongNormal < 0) {
                            const correctionVel = Vector.mult(normal, velAlongNormal);
                            Matter.Body.setVelocity(rope.bodyA, Vector.sub(vel, correctionVel));
                        }
                    }
                    
                    if (rope.bodyB && !rope.bodyB.isStatic) {
                        const ratio = rope.bodyB.inverseMass / totalInverseMass;
                        const move = Vector.mult(correction, -ratio * k);
                        Matter.Body.translate(rope.bodyB, move);

                        const vel = rope.bodyB.velocity;
                        const velAlongNormal = Vector.dot(vel, normal);
                        if (velAlongNormal > 0) {
                             const correctionVel = Vector.mult(normal, velAlongNormal);
                             Matter.Body.setVelocity(rope.bodyB, Vector.sub(vel, correctionVel));
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

        const posA = spring.bodyA ? Vector.add(spring.bodyA.position, spring.pointA) : spring.pointA;
        const posB = spring.bodyB ? Vector.add(spring.bodyB.position, spring.pointB) : spring.pointB;

        const diffVec = Vector.sub(posB, posA);
        const currentDist = Vector.magnitude(diffVec);
        
        if (currentDist < 0.1) return; // Avoid instability

        const diff = currentDist - spring.length;
        const normal = Vector.normalise(diffVec);
        
        // F = k * x
        const forceMagnitude = spring.stiffness * diff;
        const force = Vector.mult(normal, forceMagnitude);
        
        // Damping
        let velA = spring.bodyA ? spring.bodyA.velocity : { x: 0, y: 0 };
        let velB = spring.bodyB ? spring.bodyB.velocity : { x: 0, y: 0 };
        const relVel = Vector.sub(velB, velA);
        const velAlongNormal = Vector.dot(relVel, normal);
        const dampingForce = Vector.mult(normal, velAlongNormal * spring.damping);

        const totalForce = Vector.add(force, dampingForce);

        if (spring.bodyA && !spring.bodyA.isStatic) {
            Matter.Body.applyForce(spring.bodyA, posA, totalForce);
        }
        if (spring.bodyB && !spring.bodyB.isStatic) {
            Matter.Body.applyForce(spring.bodyB, posB, Vector.neg(totalForce));
        }
    }
    
    _solveIdealPulley(pulley) {
        // Pulley Constraint:
        // Length = |BodyA - PointC| + |BodyB - PointD| = Constant
        // (Assuming PointA/B are anchors on bodies, PointC/D are fixed pulleys)
        
        // Resolve bodies
        const bodyA = pulley.bodyA;
        const bodyB = pulley.bodyB;
        if (!bodyA || !bodyB) return;

        // Anchor points on bodies (world coords)
        const anchorA = Vector.add(bodyA.position, pulley.pointA);
        const anchorB = Vector.add(bodyB.position, pulley.pointB);
        
        // Fixed pulley points (world coords)
        const pulleyA = pulley.pointC;
        const pulleyB = pulley.pointD;

        // Vectors
        const vecA = Vector.sub(anchorA, pulleyA);
        const vecB = Vector.sub(anchorB, pulleyB);
        
        const lenA = Vector.magnitude(vecA);
        const lenB = Vector.magnitude(vecB);
        const currentLen = lenA + lenB;
        
        if (currentLen > pulley.length) {
            const diff = currentLen - pulley.length;
            
            // Directions (towards pulleys)
            const dirA = Vector.normalise(Vector.neg(vecA));
            const dirB = Vector.normalise(Vector.neg(vecB));
            
            // Forces
            // Tension is uniform in ideal pulley
            // F = k * diff (if elastic/soft) or positional correction
            // Let's use simple stiff spring-like correction for stability
            const k = pulley.stiffness || 0.5;
            const tension = diff * k;
            
            if (!bodyA.isStatic) {
                Matter.Body.applyForce(bodyA, anchorA, Vector.mult(dirA, tension));
            }
            if (!bodyB.isStatic) {
                Matter.Body.applyForce(bodyB, anchorB, Vector.mult(dirB, tension));
            }
        }
    }
}

export default PhysicsSceneBuilder;
