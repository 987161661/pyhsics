import PhysicsSceneBuilder from './PhysicsEngine.js';
import Matter from 'matter-js';

const { Engine, Composite } = Matter;

/**
 * 物理引擎测试系统
 * 用于验证视角切换后物体位置的稳定性
 */
class PhysicsTestSystem {
    constructor() {
        this.builder = new PhysicsSceneBuilder('test-element', 800, 600);
        this.results = [];
    }

    /**
     * 生成测试场景
     */
    generateScenario(type) {
        this.builder.clear();
        console.log(`\n--- Generating Scenario: ${type} ---`);

        const common = { friction: 0.5, restitution: 0.0 };

        switch (type) {
            case 'touching':
                // 地面
                this.builder.createBlock('ground', { x: 400, y: 580, width: 800, height: 40, isStatic: true, label: 'Ground' });
                // 左侧方块
                this.builder.createBlock('boxA', { x: 300, y: 540, width: 50, height: 50, ...common });
                // 右侧方块（紧贴）
                this.builder.createBlock('boxB', { x: 350, y: 540, width: 50, height: 50, ...common });
                break;

            case 'stack':
                this.builder.createBlock('ground', { x: 400, y: 580, width: 800, height: 40, isStatic: true });
                // 底部方块
                this.builder.createBlock('boxA', { x: 400, y: 540, width: 50, height: 50, ...common });
                // 顶部方块
                this.builder.createBlock('boxB', { x: 400, y: 490, width: 50, height: 50, ...common });
                break;

            case 'embedded':
                this.builder.createBlock('ground', { x: 400, y: 580, width: 800, height: 40, isStatic: true });
                // 嵌入地面 2px 的方块
                this.builder.createBlock('boxA', { x: 400, y: 542, width: 50, height: 50, ...common });
                break;

            case 'mixed':
                this.builder.createBlock('ground', { x: 400, y: 580, width: 800, height: 40, isStatic: true });
                this.builder.createBlock('wall', { x: 50, y: 300, width: 40, height: 600, isStatic: true });
                this.builder.createBall('ballA', { x: 200, y: 500, radius: 25, ...common });
                this.builder.createCone('coneA', { x: 250, y: 500, radius: 25, height: 50, ...common });
                this.builder.createPolygon('polyA', { x: 350, y: 500, sides: 6, radius: 30, ...common });
                break;

            case 'ball_on_block':
                // 用户报告的问题场景
                this.builder.createBlock('platform', { x: 400, y: 550, width: 200, height: 20, isStatic: true, label: 'Ground' });
                this.builder.createBlock('blueBlock', { x: 400, y: 520, width: 40, height: 40, isStatic: false, label: 'Rectangle', color: 'blue' });
                this.builder.createBall('redBall', { x: 400, y: 480, radius: 20, isStatic: false, label: 'Circle', color: 'red' });
                break;
        }
        
        // 稳定初始场景（但不运行物理模拟）
        // 新引擎不需要 warm up
    }

    runEngine(ticks) {
        for (let i = 0; i < ticks; i++) {
            Engine.update(this.builder.engine, 1000 / 60);
        }
    }

    captureState() {
        const state = {};
        const bodies = Composite.allBodies(this.builder.world);
        bodies.forEach(b => {
            if (b.plugin?.userLabel) {
                state[b.plugin.userLabel] = {
                    x: b.position.x,
                    y: b.position.y,
                    angle: b.angle,
                    vx: b.velocity.x,
                    vy: b.velocity.y,
                    av: b.angularVelocity
                };
            }
        });
        return state;
    }

    /**
     * 核心测试：切换视角后物体位置应保持不变
     */
    async runViewSwitchTest(name, scenarioType) {
        console.log(`\n=== Running Test: ${name} ===`);
        this.generateScenario(scenarioType);
        
        // Phase 1: 捕获初始状态（未运行物理模拟）
        const t0 = this.captureState();
        console.log('Initial state captured (no physics simulation)');
        
        // Phase 2: 切换视角 Side -> Top -> Side
        console.log('Switching to Top View...');
        this.builder.setViewMode('top');

        console.log('Switching back to Side View...');
        this.builder.setViewMode('side');
        
        // Phase 3: 捕获切换后状态（仍未运行物理模拟）
        const t1 = this.captureState();

        // Phase 4: 验证
        this.verify(t0, t1, name);
    }

    /**
     * 测试：物理模拟 + 视角切换
     */
    async runSimulationTest(name, scenarioType) {
        console.log(`\n=== Running Test: ${name} ===`);
        this.generateScenario(scenarioType);
        
        // Phase 1: 运行物理模拟让物体稳定
        console.log('Running physics simulation to stabilize...');
        this.builder.setSimulationRunning(true);
        this.runEngine(60);
        this.builder.setSimulationRunning(false);
        
        // Phase 2: 捕获稳定后状态
        const t0 = this.captureState();
        console.log('Stable state captured');
        
        // Phase 3: 切换视角
        console.log('Switching views...');
        this.builder.setViewMode('top');
        this.builder.setViewMode('side');
        
        // Phase 4: 捕获切换后状态
        const t1 = this.captureState();

        // Phase 5: 验证
        this.verify(t0, t1, name);
    }

    /**
     * 测试：静态物体移动后切换视角
     */
    async testStaticMove() {
        console.log(`\n=== Running Test: Static Object Move ===`);
        this.builder.clear();
        
        this.builder.createBlock('staticBlock', { x: 400, y: 500, width: 50, height: 50, isStatic: true, label: 'Box' });

        // 通过 updateObject 移动（模拟拖拽）
        this.builder.updateObject('staticBlock', { y: 400 });
        
        const t0 = this.captureState();
        console.log(`Moved static block to y=400. Captured y=${t0['staticBlock']?.y}`);

        // 切换视角
        this.builder.setViewMode('top');
        this.builder.setViewMode('side');

        const t1 = this.captureState();
        
        this.verify(t0, t1, 'Static Object Move');
    }

    /**
     * 测试：尺寸修改后切换视角
     */
    async testResize() {
        console.log(`\n=== Running Test: Resize Persistence ===`);
        this.builder.clear();
        
        this.builder.createBlock('resizeBlock', { x: 400, y: 500, width: 100, height: 100, isStatic: true, label: 'Rectangle' });
        
        // 修改尺寸
        this.builder.updateObject('resizeBlock', { width: 50, height: 50 });
        
        let body = this.builder.entities['resizeBlock'];
        let w = body.bounds.max.x - body.bounds.min.x;
        let h = body.bounds.max.y - body.bounds.min.y;
        console.log(`Body Size after update: ${w.toFixed(1)}x${h.toFixed(1)}`);
        
        const sizeBefore = { w, h };

        // 切换视角
        this.builder.setViewMode('top');
        this.builder.setViewMode('side');
        
        body = this.builder.entities['resizeBlock'];
        w = body.bounds.max.x - body.bounds.min.x;
        h = body.bounds.max.y - body.bounds.min.y;
        console.log(`Body Size after rebuild: ${w.toFixed(1)}x${h.toFixed(1)}`);
        
        if (Math.abs(w - sizeBefore.w) > 1 || Math.abs(h - sizeBefore.h) > 1) {
            console.error('[FAIL] Body size changed after view switch!');
        } else {
            console.log('[PASS] Resize persisted.');
        }
    }

    /**
     * 拖拽并切换视角测试
     * 模拟用户拖拽物体后切换视角，验证位置是否正确保存
     */
    async runDragAndSwitchTest() {
        console.log('\n=== Running Test: Drag and Switch ===');
        this.builder.clear();
        
        // 1. Create a block in Side View
        this.builder.setViewMode('side');
        this.builder.createBlock('testBlock', { x: 100, y: 100, width: 50, height: 50 });
        
        let data = this.builder.sceneData['testBlock'];
        console.log(`[Step 1] Created: x=${data.x}, y=${data.y}, z=${data.z}`);
        
        // 2. Simulate Drag End (Update Object)
        // Simulate dragging to (200, 200)
        console.log('[Step 2] Simulating Drag to (200, 200)...');
        this.builder.updateObject('testBlock', { x: 200, y: 200 });
        
        data = this.builder.sceneData['testBlock'];
        console.log(`[Step 2] After Update: x=${data.x}, y=${data.y}, z=${data.z}`);
        
        if (data.x !== 200 || data.y !== 200) {
            console.error('FAIL: UpdateObject failed to update sceneData');
            return false;
        }

        // 3. Switch to Top View
        console.log('[Step 3] Switching to Top View...');
        this.builder.setViewMode('top');
        
        data = this.builder.sceneData['testBlock'];
        // In Top View, x should be 200, z should be 200 (since we mapped y->z in syncToSceneData logic?) 
        // Wait, syncToSceneData maps Body(x,y) -> Data(x,z) in Top View.
        // But when switching FROM Side TO Top:
        // 1. syncToSceneData (Side Mode): Data.x = Body.x, Data.y = Body.y. (Data.z unchanged)
        // 2. View Mode = Top
        // 3. rebuildWorld: uses Data.x, Data.z.
        
        // Let's see what happens.
        // Initial: x=100, y=100, z=300 (default height/2)
        // Drag Update: x=200, y=200. (z still 300)
        // Switch Side -> Top:
        // syncToSceneData: Data.x=200, Data.y=200.
        // rebuildWorld (Top): Body.x = Data.x = 200, Body.y = Data.z = 300.
        
        console.log(`[Step 3] Data in Top View: x=${data.x}, y=${data.y}, z=${data.z}`);
        const bodyTop = this.builder.entities['testBlock'];
        console.log(`[Step 3] Body in Top View: x=${bodyTop.position.x}, y=${bodyTop.position.y}`);
        
        if (data.x !== 200 || data.y !== 200) {
             console.error('FAIL: Data lost during view switch (Side -> Top)');
             return false;
        }
        
        // 4. Switch back to Side View
        console.log('[Step 4] Switching back to Side View...');
        this.builder.setViewMode('side');
        
        data = this.builder.sceneData['testBlock'];
        // Switch Top -> Side:
        // syncToSceneData (Top Mode): Data.x = Body.x (200), Data.z = Body.y (300).
        // rebuildWorld (Side): Body.x = Data.x (200), Body.y = Data.y (200).
        
        console.log(`[Step 4] Data in Side View: x=${data.x}, y=${data.y}, z=${data.z}`);
        const bodySide = this.builder.entities['testBlock'];
        console.log(`[Step 4] Body in Side View: x=${bodySide.position.x}, y=${bodySide.position.y}`);
        
        if (Math.abs(bodySide.position.x - 200) > 1 || Math.abs(bodySide.position.y - 200) > 1) {
             console.error(`FAIL: Position reset! Expected (200, 200), Got (${bodySide.position.x}, ${bodySide.position.y})`);
             return false;
        }
        
        console.log('SUCCESS: Position preserved after drag and view switch cycle.');
        return true;
    }

    verify(before, after, testName) {
        let passed = true;
        const tolerance = 0.5; // 0.5 像素容差
        const angleTolerance = 0.01;

        Object.keys(before).forEach(id => {
            const b = before[id];
            const a = after[id];

            if (!a) {
                console.error(`[FAIL] Object ${id} disappeared!`);
                passed = false;
                return;
            }

            const dx = Math.abs(b.x - a.x);
            const dy = Math.abs(b.y - a.y);
            const da = Math.abs(b.angle - a.angle);

            console.log(`  ${id}: T0(${b.x.toFixed(1)}, ${b.y.toFixed(1)}) -> T1(${a.x.toFixed(1)}, ${a.y.toFixed(1)}) | dy=${dy.toFixed(3)}`);

            if (dx > tolerance || dy > tolerance || da > angleTolerance) {
                console.error(`  [FAIL] Object ${id} moved! dx=${dx.toFixed(3)}, dy=${dy.toFixed(3)}, da=${da.toFixed(3)}`);
                passed = false;
            }
        });

        if (passed) {
            console.log(`>>> ${testName}: PASSED ✓`);
        } else {
            console.log(`>>> ${testName}: FAILED ✗`);
        }
        
        return passed;
    }

    /**
     * 运行所有测试
     */
    async runAllTests() {
        console.log('\n' + '='.repeat(60));
        console.log('         PHYSICS ENGINE TEST SUITE');
        console.log('='.repeat(60));

        // 纯视角切换测试（无物理模拟）
        await this.runViewSwitchTest('Touching Blocks (No Physics)', 'touching');
        await this.runViewSwitchTest('Stacked Blocks (No Physics)', 'stack');
        await this.runViewSwitchTest('Ball on Block (No Physics)', 'ball_on_block');

        // 物理模拟 + 视角切换测试
        await this.runSimulationTest('Touching Blocks (With Physics)', 'touching');
        await this.runSimulationTest('Stacked Blocks (With Physics)', 'stack');
        await this.runSimulationTest('Ball on Block (With Physics)', 'ball_on_block');

        // 其他测试
        await this.testStaticMove();
        await this.testResize();

        console.log('\n' + '='.repeat(60));
        console.log('         TEST SUITE COMPLETE');
        console.log('='.repeat(60));
    }
}

// 导出以便在浏览器控制台运行
if (typeof window !== 'undefined') {
    window.PhysicsTestSystem = PhysicsTestSystem;
}

export default PhysicsTestSystem;

// 如果直接运行此文件
// const tester = new PhysicsTestSystem();
// tester.runAllTests();
