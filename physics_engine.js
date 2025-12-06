// 物理场景构建器
// 负责根据输入参数生成 Matter.js 物理世界

const Matter = require('matter-js');

// 模块解构
const { Engine, Render, Runner, World, Bodies, Body, Composite, Constraint, Vector } = Matter;

class PhysicsSceneBuilder {
    constructor(elementId, width = 800, height = 600) {
        this.width = width;
        this.height = height;
        this.elementId = elementId;
        
        // 初始化引擎
        this.engine = Engine.create();
        this.world = this.engine.world;
        
        // 初始化渲染器
        // 注意：在实际前端环境中，element 应该是 DOM 元素
        // 这里为了后端测试兼容性，暂时只创建引擎，渲染器在前端集成时再初始化
        this.render = null;
        
        // 存储所有创建的实体，方便后续查找
        this.entities = {};
    }

    /**
     * 初始化渲染器 (前端调用)
     * @param {HTMLElement} element 
     */
    initRenderer(element) {
        this.render = Render.create({
            element: element,
            engine: this.engine,
            options: {
                width: this.width,
                height: this.height,
                wireframes: false, // 开启实体模式
                showAngleIndicator: true, // 显示角度
                showCollisions: true,
                showVelocity: true
            }
        });
        Render.run(this.render);
        
        // 创建运行器
        const runner = Runner.create();
        Runner.run(runner, this.engine);
    }

    /**
     * 清空场景
     */
    clear() {
        Composite.clear(this.world);
        Engine.clear(this.engine);
        this.entities = {};
    }

    /**
     * 创建基础矩形物体 (滑块、箱子等)
     * @param {string} id 唯一标识
     * @param {object} params 参数 { x, y, width, height, color, isStatic, friction, mass, angle }
     */
    createBlock(id, params) {
        const { x, y, width, height, color = '#3498db', isStatic = false, friction = 0.5, mass, angle = 0 } = params;
        
        const block = Bodies.rectangle(x, y, width, height, {
            isStatic: isStatic,
            friction: friction,
            frictionAir: 0.01, // 空气阻力
            angle: angle * (Math.PI / 180), // 角度转弧度
            render: { fillStyle: color },
            label: id
        });

        if (mass) {
            Body.setMass(block, mass);
        }

        Composite.add(this.world, block);
        this.entities[id] = block;
        return block;
    }

    /**
     * 创建圆形物体 (小球、粒子)
     * @param {string} id 
     * @param {object} params { x, y, radius, color, isStatic, friction, restitution, mass }
     */
    createBall(id, params) {
        const { x, y, radius, color = '#e74c3c', isStatic = false, friction = 0.1, restitution = 0.8, mass } = params;
        
        const ball = Bodies.circle(x, y, radius, {
            isStatic: isStatic,
            friction: friction,
            restitution: restitution, // 弹性系数 (0-1)
            render: { fillStyle: color },
            label: id
        });

        if (mass) {
            Body.setMass(ball, mass);
        }

        Composite.add(this.world, ball);
        this.entities[id] = ball;
        return ball;
    }

    /**
     * 创建斜面
     * @param {string} id 
     * @param {object} params { x, y, width, height, angle, friction }
     */
    createRamp(id, params) {
        // 斜面本质上就是一个旋转的静态矩形
        return this.createBlock(id, {
            ...params,
            isStatic: true,
            color: '#95a5a6'
        });
    }

    /**
     * 创建地面
     * @param {number} height 地面厚度
     */
    createGround(height = 60) {
        return this.createBlock('ground', {
            x: this.width / 2,
            y: this.height - height / 2,
            width: this.width,
            height: height,
            isStatic: true,
            color: '#2c3e50',
            friction: 1.0
        });
    }

    /**
     * 创建墙壁 (四周)
     */
    createWalls(thickness = 60) {
        const walls = [
            Bodies.rectangle(this.width / 2, 0, this.width, thickness, { isStatic: true }), // Top
            Bodies.rectangle(this.width / 2, this.height, this.width, thickness, { isStatic: true }), // Bottom
            Bodies.rectangle(this.width, this.height / 2, thickness, this.height, { isStatic: true }), // Right
            Bodies.rectangle(0, this.height / 2, thickness, this.height, { isStatic: true }) // Left
        ];
        Composite.add(this.world, walls);
    }

    /**
     * 创建理想绳索 (Ideal Rope)
     * 特性：质量为0，不可伸长，只能承受拉力（松弛时无力）
     * 实现原理：在 beforeUpdate 中检测长度，仅在拉伸时施加约束力
     * @param {string} id 
     * @param {object} params { bodyAId, bodyBId, pointA, pointB, length, style }
     */
    createIdealRope(id, params) {
        const { bodyAId, bodyBId, pointA, pointB, length, style } = params;
        
        // 记录绳索数据，不创建物理实体，而是创建逻辑约束
        const ropeData = {
            id,
            type: 'ideal_rope',
            bodyA: bodyAId ? this.entities[bodyAId] : null,
            bodyB: bodyBId ? this.entities[bodyBId] : null,
            pointA: pointA || { x: 0, y: 0 },
            pointB: pointB || { x: 0, y: 0 },
            length: length,
            style: style || { strokeStyle: '#e67e22', lineWidth: 2 }
        };

        // 注册到自定义约束列表
        if (!this.customConstraints) this.customConstraints = [];
        this.customConstraints.push(ropeData);

        // 注册渲染器 (如果尚未注册)
        if (!this.hasRegisteredEvents) {
            this._registerCustomUpdate();
            this.hasRegisteredEvents = true;
        }
        
        return ropeData;
    }

    /**
     * 创建理想滑轮组 (Ideal Pulley System)
     * 特性：绳索跨过滑轮，总长固定，张力处处相等
     * 实现原理：L = dist(A, Pulley) + dist(B, Pulley) <= MaxLength
     * @param {string} id 
     * @param {object} params { x, y, radius, bodyAId, bodyBId, anchorA, anchorB, length }
     */
    createIdealPulley(id, params) {
        const { x, y, radius = 20, bodyAId, bodyBId, anchorA, anchorB, length } = params;

        // 创建滑轮视觉实体 (Static)
        const pulleyBody = Bodies.circle(x, y, radius, {
            isStatic: true,
            label: id + '_body',
            collisionFilter: { group: -1 }, // 不参与物理碰撞
            render: { fillStyle: '#95a5a6', strokeStyle: '#7f8c8d', lineWidth: 2 }
        });
        Composite.add(this.world, pulleyBody);
        this.entities[id] = pulleyBody;

        const pulleyData = {
            id,
            type: 'ideal_pulley',
            center: { x, y },
            radius,
            bodyA: bodyAId ? this.entities[bodyAId] : null,
            bodyB: bodyBId ? this.entities[bodyBId] : null,
            anchorA: anchorA || { x: 0, y: 0 }, // 绳子在物体A上的挂点（相对坐标）
            anchorB: anchorB || { x: 0, y: 0 }, // 绳子在物体B上的挂点（相对坐标）
            length: length // 绳索总长
        };

        if (!this.customConstraints) this.customConstraints = [];
        this.customConstraints.push(pulleyData);

        if (!this.hasRegisteredEvents) {
            this._registerCustomUpdate();
            this.hasRegisteredEvents = true;
        }
    }

    /**
     * 创建传送带 (Conveyor Belt)
     * @param {string} id 
     * @param {object} params { x, y, width, height, speed, friction }
     */
    createConveyorBelt(id, params) {
        const { x, y, width, height, speed = 5, friction = 0.8 } = params;
        
        // 传送带本体
        const belt = Bodies.rectangle(x, y, width, height, {
            isStatic: true,
            label: id,
            friction: friction,
            render: { fillStyle: '#34495e' },
            plugin: { conveyorSpeed: speed } // 自定义属性
        });

        Composite.add(this.world, belt);
        this.entities[id] = belt;

        // 注册碰撞事件处理传送带逻辑
        if (!this.hasRegisteredCollision) {
            Matter.Events.on(this.engine, 'collisionActive', (event) => {
                const pairs = event.pairs;
                pairs.forEach(pair => {
                    let beltBody = null;
                    let otherBody = null;

                    if (pair.bodyA.plugin && pair.bodyA.plugin.conveyorSpeed !== undefined) {
                        beltBody = pair.bodyA;
                        otherBody = pair.bodyB;
                    } else if (pair.bodyB.plugin && pair.bodyB.plugin.conveyorSpeed !== undefined) {
                        beltBody = pair.bodyB;
                        otherBody = pair.bodyA;
                    }

                    if (beltBody && !otherBody.isStatic) {
                        // 施加摩擦力使物体速度趋向传送带速度
                        // 简化模型：直接修改切向速度或施加切向力
                        // 这里使用施加力的方式更符合物理引擎逻辑
                        const speed = beltBody.plugin.conveyorSpeed;
                        // 假设传送带水平向右
                        const targetVelocityX = speed;
                        const currentVelocityX = otherBody.velocity.x;
                        const forceX = (targetVelocityX - currentVelocityX) * 0.002 * otherBody.mass; // 简易 P 控制
                        
                        Matter.Body.applyForce(otherBody, otherBody.position, { x: forceX, y: 0 });
                    }
                });
            });
            this.hasRegisteredCollision = true;
        }
    }

    /**
     * 内部方法：注册自定义物理更新逻辑
     */
    _registerCustomUpdate() {
        Matter.Events.on(this.engine, 'beforeUpdate', () => {
            // 1. 处理自定义约束 (迭代多次以提高刚性)
            const iterations = 5;
            for (let i = 0; i < iterations; i++) {
                if (this.customConstraints) {
                    this.customConstraints.forEach(cons => {
                        if (cons.type === 'ideal_rope') {
                            this._solveIdealRope(cons);
                        } else if (cons.type === 'ideal_pulley') {
                            this._solveIdealPulley(cons);
                        }
                    });
                }
            }

            // 2. 处理传送带 (每一帧检测一次即可)
            this._solveConveyorBelts();
        });
    }

    _solveConveyorBelts() {
        // 获取所有传送带实体
        const belts = Object.values(this.entities).filter(e => e.plugin && e.plugin.conveyorSpeed !== undefined);
        if (belts.length === 0) return;

        // 获取所有非静态刚体
        const bodies = Composite.allBodies(this.world).filter(b => !b.isStatic);
        
        belts.forEach(belt => {
            // 使用 AABB 宽相检测快速筛选附近的物体
            const candidates = Matter.Query.region(bodies, belt.bounds);
            
            candidates.forEach(body => {
                // 使用 SAT 窄相检测确认是否接触
                // 修复：使用 Collision.collides 替代 SAT.collides
                const collision = Matter.Collision.collides(belt, body);
                if (collision && collision.collided) {
                    // 施加传送带效果
                    const speed = belt.plugin.conveyorSpeed;
                    // 假设传送带方向为 body 自身的角度 (通常是水平 0 度)
                    // 这里简化为水平传送带
                    const beltDir = { x: Math.cos(belt.angle), y: Math.sin(belt.angle) };
                    
                    // 目标速度向量
                    const targetVel = Vector.mult(beltDir, speed);
                    
                    // 计算当前相对速度
                    const relVelX = body.velocity.x - targetVel.x;
                    
                    // 施加摩擦力修正速度 (P 控制)
                    // 摩擦系数越大，修正越快
                    const friction = belt.friction * body.friction; 
                    
                    // 调优后的系数: k=0.1 对于 applyForce 来说太小了
                    // F = m * a. 想要在一帧(1/60s)内修正速度，F = m * dv * 60
                    // 我们不希望瞬间修正，而是平滑修正，所以乘一个系数 0.1 - 0.5
                    const k = 0.2 * 60 * friction; 
                    
                    Matter.Body.applyForce(body, body.position, {
                        x: -relVelX * k * body.mass * 0.001, // Matter.js 的 Force 单位需要调整
                        y: 0
                    });

                    // 备用方案：如果力还是不够，直接修正速度
                    if (Math.abs(relVelX) > 0.1) {
                         Matter.Body.setVelocity(body, {
                             x: body.velocity.x - relVelX * 0.1, // 渐进修正
                             y: body.velocity.y
                         });
                    }
                }
            });
        });
    }

    _solveIdealRope(rope) {
        // 容错检查
        if (!rope.bodyA && !rope.bodyB) return;

        // 获取两端点的世界坐标
        const posA = rope.bodyA ? Vector.add(rope.bodyA.position, rope.pointA) : rope.pointA;
        const posB = rope.bodyB ? Vector.add(rope.bodyB.position, rope.pointB) : rope.pointB;

        const diffVec = Vector.sub(posB, posA);
        const currentDist = Vector.magnitude(diffVec);

        // 只有当长度超过设定值时才进行修正 (模拟绳子拉紧)
        if (currentDist > rope.length + 0.1) { // 0.1 容差
            const diff = currentDist - rope.length;
            const normal = Vector.normalise(diffVec);
            
            // 位置修正 (Projection)
            const correction = Vector.mult(normal, diff);
            
            // 根据质量分配修正量 (质量越大，移动越少)
            let totalInverseMass = 0;
            if (rope.bodyA && !rope.bodyA.isStatic) totalInverseMass += rope.bodyA.inverseMass;
            if (rope.bodyB && !rope.bodyB.isStatic) totalInverseMass += rope.bodyB.inverseMass;

            if (totalInverseMass > 0) {
                const k = 0.95; // 提高修正系数，使其更刚性
                
                if (rope.bodyA && !rope.bodyA.isStatic) {
                    const ratio = rope.bodyA.inverseMass / totalInverseMass;
                    const move = Vector.mult(correction, ratio * k);
                    Matter.Body.translate(rope.bodyA, move);
                    
                    // 速度修正：消除沿绳子方向的分离速度
                    const vel = rope.bodyA.velocity;
                    const velAlongNormal = Vector.dot(vel, normal);
                    // 如果正在远离 (velAlongNormal < 0)，则消除该分量
                    if (velAlongNormal < 0) {
                        const correctionVel = Vector.mult(normal, velAlongNormal);
                        Matter.Body.setVelocity(rope.bodyA, Vector.sub(vel, correctionVel));
                    }
                }
                
                if (rope.bodyB && !rope.bodyB.isStatic) {
                    const ratio = rope.bodyB.inverseMass / totalInverseMass;
                    const move = Vector.mult(correction, -ratio * k); // 反向
                    Matter.Body.translate(rope.bodyB, move);

                    // 速度修正
                    const vel = rope.bodyB.velocity;
                    // B 端的 normal 是指向 B 的 (diffVec = B - A)
                    const velAlongNormal = Vector.dot(vel, normal);
                    // B 正在远离 A (即沿 normal 方向运动, velAlongNormal > 0)
                    if (velAlongNormal > 0) {
                         const correctionVel = Vector.mult(normal, velAlongNormal);
                         Matter.Body.setVelocity(rope.bodyB, Vector.sub(vel, correctionVel));
                    }
                }
            }
        }
    }

    _solveIdealPulley(pulley) {
        // L = |P - A| + |P - B|
        const posP = pulley.center;
        // 容错：如果 body 不存在，使用 anchor 作为绝对坐标（虽然不合理，但防止崩溃）
        const posA = pulley.bodyA ? Vector.add(pulley.bodyA.position, pulley.anchorA) : Vector.add(posP, {x:-50, y:0}); 
        const posB = pulley.bodyB ? Vector.add(pulley.bodyB.position, pulley.anchorB) : Vector.add(posP, {x:50, y:0});

        const vecA = Vector.sub(posA, posP);
        const vecB = Vector.sub(posB, posP);
        
        const lenA = Vector.magnitude(vecA);
        const lenB = Vector.magnitude(vecB);
        const currentTotalLen = lenA + lenB;

        if (currentTotalLen > pulley.length + 0.1) {
            const diff = currentTotalLen - pulley.length;
            
            // 力的方向：物体指向滑轮
            const dirA = Vector.normalise(Vector.neg(vecA)); // A -> P
            const dirB = Vector.normalise(Vector.neg(vecB)); // B -> P

            // 质量计算
            let invMassA = (pulley.bodyA && !pulley.bodyA.isStatic) ? pulley.bodyA.inverseMass : 0;
            let invMassB = (pulley.bodyB && !pulley.bodyB.isStatic) ? pulley.bodyB.inverseMass : 0;
            const totalInvMass = invMassA + invMassB;

            if (totalInvMass > 0) {
                const k = 0.8; // 修正系数
                // 分配移动量：这里假设绳子在滑轮处无摩擦，两端张力相等，
                // 但位置修正按质量分配是比较稳定的近似
                
                if (pulley.bodyA && !pulley.bodyA.isStatic) {
                    const ratio = invMassA / totalInvMass;
                    // A 应该向 P 移动
                    const move = Vector.mult(dirA, diff * ratio * k);
                    Matter.Body.translate(pulley.bodyA, move);
                }

                if (pulley.bodyB && !pulley.bodyB.isStatic) {
                    const ratio = invMassB / totalInvMass;
                    // B 应该向 P 移动
                    const move = Vector.mult(dirB, diff * ratio * k);
                    Matter.Body.translate(pulley.bodyB, move);
                }
            }
        }
    }

    /**
     * 创建简单滑轮 (定滑轮效果 - 改变力的方向)
     * 注意：Matter.js 没有原生滑轮，通常用 Constraint 模拟
     * 这是一个简化的实现，通过一个固定点连接两个物体
     * @param {string} id 
     * @param {object} params { x, y, bodyAId, bodyBId, length }
     */
    createSimplePulley(id, params) {
        // 真正的滑轮需要更复杂的物理模拟（如绳索分段），这里实现一个简易版：
        // 两个物体分别连接到同一个滑轮点，且通过逻辑保持总绳长不变（需要每帧更新，这里暂实现为两个固定约束）
        // *进阶实现需要 update 事件监听*
        
        const { x, y, bodyAId, bodyBId } = params;
        
        // 滑轮本体 (视觉)
        const pulleyCircle = Bodies.circle(x, y, 20, { 
            isStatic: true,
            render: { fillStyle: '#7f8c8d' },
            collisionFilter: { group: -1 } // 不与绳索碰撞
        });
        Composite.add(this.world, pulleyCircle);

        // 这里暂时只连接物体到滑轮点，后续需要添加 "总长度约束" 的逻辑控制器
        if (bodyAId && this.entities[bodyAId]) {
            const ropeA = Constraint.create({
                bodyA: this.entities[bodyAId],
                pointB: { x, y },
                length: 150, // 初始长度
                stiffness: 1,
                render: { strokeStyle: '#bdc3c7' }
            });
            Composite.add(this.world, ropeA);
        }

        if (bodyBId && this.entities[bodyBId]) {
            const ropeB = Constraint.create({
                bodyA: this.entities[bodyBId],
                pointB: { x, y },
                length: 150,
                stiffness: 1,
                render: { strokeStyle: '#bdc3c7' }
            });
            Composite.add(this.world, ropeB);
        }
    }

    /**
     * 根据 JSON 配置批量构建场景
     * @param {object} sceneConfig 
     */
    buildFromJSON(sceneConfig) {
        this.clear();

        if (sceneConfig.setup) {
             if (sceneConfig.setup.gravity) {
                 this.engine.gravity.x = sceneConfig.setup.gravity.x || 0;
                 this.engine.gravity.y = sceneConfig.setup.gravity.y || 1;
             }
        }

        if (sceneConfig.objects) {
            sceneConfig.objects.forEach(obj => {
                switch(obj.type) {
                    case 'block':
                        this.createBlock(obj.id, obj.params);
                        break;
                    case 'ball':
                        this.createBall(obj.id, obj.params);
                        break;
                    case 'ramp':
                        this.createRamp(obj.id, obj.params);
                        break;
                    case 'ground':
                        this.createGround(obj.params?.height);
                        break;
                    case 'wall':
                        this.createWalls();
                        break;
                }
            });
        }

        if (sceneConfig.constraints) {
            sceneConfig.constraints.forEach(cons => {
                switch(cons.type) {
                    case 'rope':
                        // 兼容旧配置
                        this.createIdealRope(cons.id, cons.params);
                        break;
                    case 'ideal_rope':
                        this.createIdealRope(cons.id, cons.params);
                        break;
                    case 'spring':
                        this.createSpring(cons.id, cons.params);
                        break;
                    case 'pulley':
                        // 兼容旧配置
                        this.createIdealPulley(cons.id, cons.params);
                        break;
                    case 'ideal_pulley':
                        this.createIdealPulley(cons.id, cons.params);
                        break;
                }
            });
        }
    }
}

// 导出供前端或测试使用
if (typeof module !== 'undefined') {
    module.exports = PhysicsSceneBuilder;
}
