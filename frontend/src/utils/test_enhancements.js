
import PhysicsSceneBuilder from './PhysicsEngine.js';
import Matter from 'matter-js';

// Mock console.warn to keep output clean
console.warn = () => {};

async function testEnhancements() {
    console.log("Starting Physics Engine Enhancements Test...");

    const builder = new PhysicsSceneBuilder('test-canvas', 800, 600);
    const engine = builder.getEngine();

    // 1. Test setEngineProperties (Gravity)
    console.log("Testing setEngineProperties (Gravity)...");
    builder.setEngineProperties({ gravity: { x: 0.5, y: 2.0 } });
    if (engine.world.gravity.x === 0.5 && engine.world.gravity.y === 2.0) {
        console.log("PASS: Gravity updated.");
    } else {
        console.error("FAIL: Gravity not updated.", engine.world.gravity);
    }

    // 2. Test setEngineProperties (Air Resistance)
    console.log("Testing setEngineProperties (Air Resistance)...");
    // Create a body first
    builder.createBlock('block1', { x: 100, y: 100, width: 50, height: 50 });
    const body1 = builder.entities['block1'];
    
    builder.setEngineProperties({ airResistance: 0.05 });
    
    if (body1.frictionAir === 0.05) {
        console.log("PASS: Existing body frictionAir updated.");
    } else {
        console.error("FAIL: Existing body frictionAir not updated.", body1.frictionAir);
    }

    if (builder.globalAirResistance === 0.05) {
        console.log("PASS: Global air resistance stored.");
    } else {
        console.error("FAIL: Global air resistance not stored.");
    }

    // 3. Test New Body inherits Air Resistance
    console.log("Testing New Body Air Resistance...");
    builder.createBlock('block2', { x: 200, y: 100, width: 50, height: 50 });
    const body2 = builder.entities['block2'];
    
    if (body2.frictionAir === 0.05) {
        console.log("PASS: New body inherited global frictionAir.");
    } else {
        console.error("FAIL: New body did not inherit frictionAir.", body2.frictionAir);
    }

    // 4. Test Telemetry
    console.log("Testing Telemetry...");
    // Run engine a bit
    Matter.Engine.update(engine, 1000/60);
    
    const telemetry = builder.getTelemetry();
    if (telemetry['block1'] && telemetry['block2']) {
        const t1 = telemetry['block1'];
        if (t1.position && t1.velocity) {
             console.log("PASS: Telemetry data present.", t1.velocity);
        } else {
             console.error("FAIL: Telemetry data incomplete.");
        }
    } else {
        console.error("FAIL: Telemetry missing bodies.");
    }

    // 5. Test Force Creation and Application
    console.log("Testing Force Creation...");
    builder.createForce('force1', { bodyId: 'block1', vector: { x: 0.1, y: 0 } });
    
    // Check if constraint added
    const forces = builder.customConstraints.filter(c => c.type === 'force');
    if (forces.length === 1 && forces[0].vector.x === 0.1) {
        console.log("PASS: Force constraint created.");
    } else {
        console.error("FAIL: Force constraint not found.");
    }

    // Run engine to see if force is applied (Velocity should increase)
    // Reset velocity
    Matter.Body.setVelocity(body1, { x: 0, y: 0 });
    const initialV = body1.velocity.x;
    Matter.Engine.update(engine, 1000/60);
    const finalV = body1.velocity.x;
    
    if (finalV > initialV) {
        console.log("PASS: Force applied (Velocity increased).", finalV);
    } else {
        // Note: frictionAir might reduce velocity if force is too small, but here force 0.1 is significant relative to mass (default)
        // Body mass depends on size. 50x50 -> Area 2500. Density 0.001 -> 2.5kg.
        // F=0.1 -> a = 0.04. v = a*t = 0.04 * 0.016 = 0.0006.
        // It should be positive.
        console.error("FAIL: Force not applied.", finalV);
    }

    // 6. Test Pulley Logic (PBD)
    console.log("Testing Pulley Logic...");
    builder.createBlock('pBodyA', { x: 300, y: 300, width: 30, height: 30 });
    builder.createBlock('pBodyB', { x: 400, y: 300, width: 30, height: 30 });
    const pBodyA = builder.entities['pBodyA'];
    const pBodyB = builder.entities['pBodyB'];
    
    // Create Pulley: A(300,300) -> Fixed(300,100) -> Fixed(400,100) -> B(400,300)
    // Lengths: 200 + 200 = 400.
    builder.createPulley('pulley1', { 
        bodyAId: 'pBodyA', bodyBId: 'pBodyB',
        pointA: {x:0, y:0}, pointB: {x:0, y:0},
        pointC: {x:300, y:100}, pointD: {x:400, y:100},
        length: 400
    });

    // Move Body A down by 50px. Total length becomes 250 + 200 = 450. Error = 50.
    Matter.Body.setPosition(pBodyA, { x: 300, y: 350 });
    
    // Update
    Matter.Engine.update(engine, 1000/60);
    
    // Check results. PBD should pull bodies up.
    // Since equal mass, they should share the correction.
    // pBodyA should move up ~25px. pBodyB should move up ~25px?
    // Wait, B is at 300 (length 200). A is at 350 (length 250).
    // Total 450. Target 400.
    // Correction 50.
    // Split 25 each.
    // A -> 325. B -> 275.
    
    const yA = pBodyA.position.y;
    const yB = pBodyB.position.y;
    console.log(`Pulley Result: A.y=${yA}, B.y=${yB}`);
    
    if (yA < 350 && yB < 300) {
        console.log("PASS: Pulley constraint corrected positions.");
    } else {
        console.error("FAIL: Pulley constraint did not correct positions properly.");
    }

    console.log("Test Complete.");
}

testEnhancements();
