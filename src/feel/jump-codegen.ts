import type { JumpParams } from "./jump";

export function jumpJson(params: JumpParams): string {
  return JSON.stringify(params, null, 2);
}

export function godotJump(params: JumpParams): string {
  return `extends CharacterBody2D
# Reference hookup for a grounded CharacterBody2D, positive Y down.
# Add the "jump" input action and a collision shape, and supply velocity.x
# from your own movement before move_and_slide(). Call move_and_slide once.
# The web room uses 120 Hz. Set the physics tick rate to 120 for similar timing.
# Floor results come from move_and_slide(); tune floor settings in your project.
# Fe (indienova, 2021-09-20) — separate coyote and input buffer timers.
# Godot docs — Using CharacterBody2D/3D. This is a vertical movement reference.

const COYOTE_ENABLED: bool = ${params.coyoteEnabled}
const COYOTE_MS: int = ${params.coyoteMs}
const BUFFER_ENABLED: bool = ${params.bufferEnabled}
const BUFFER_MS: int = ${params.bufferMs}
const VARIABLE_HEIGHT: bool = ${params.variableHeight}
const RELEASE_SPEED: float = ${params.releaseSpeed}.0
const GRAVITY: float = ${params.gravity}.0
const JUMP_SPEED: float = ${params.jumpSpeed}.0

var coyote_left: float = 0.0
var buffer_left: float = 0.0
var launch_pending: bool = false
var consumed: bool = false

func _physics_process(delta: float) -> void:
\tvar was_grounded: bool = is_on_floor()
\tvar pressed: bool = Input.is_action_just_pressed("jump")
\t# A landing scheduled the launch after move_and_slide last tick.
\tvar launched: bool = launch_pending
\tlaunch_pending = false
\tif launched:
\t\tvelocity.y = -JUMP_SPEED
\telif pressed and not consumed and (was_grounded or coyote_left > 0.0):
\t\tlaunch()
\t\tlaunched = true
\telse:
\t\tcoyote_left = maxf(0.0, coyote_left - delta)
\t\tbuffer_left = maxf(0.0, buffer_left - delta)
\t\tif pressed:
\t\t\tbuffer_left = BUFFER_MS / 1000.0 if BUFFER_ENABLED else 0.0

\tif VARIABLE_HEIGHT and not Input.is_action_pressed("jump"):
\t\tvelocity.y = maxf(velocity.y, -RELEASE_SPEED)
\tvelocity.y += GRAVITY * delta
\tmove_and_slide()

\tif is_on_floor():
\t\tconsumed = false
\t\tcoyote_left = 0.0
\t\tif not launched and (pressed or buffer_left > 0.0):
\t\t\t# Schedule one impulse for the next physics tick.
\t\t\tlaunch_pending = true
\t\t\tconsumed = true
\t\t\tbuffer_left = 0.0
\telif was_grounded and not consumed and not launched:
\t\tcoyote_left = COYOTE_MS / 1000.0 if COYOTE_ENABLED else 0.0

func launch() -> void:
\tvelocity.y = -JUMP_SPEED
\tconsumed = true
\tcoyote_left = 0.0
\tbuffer_left = 0.0
`;
}
