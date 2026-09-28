// Virtual input via UserInputService:CreateVirtualInput().
//
// We deliberately do NOT use VirtualInputManager:Send*Event — those methods
// are gated behind RobloxScriptSecurity ("lacking capability RobloxScript")
// in every context a plugin can reach (edit DM, play server/client DMs), so
// they silently never worked. CreateVirtualInput() is callable without that
// capability and drives the REAL input pipeline: SendKey feeds
// UserInputService.InputBegan/Ended and the control modules (so WASD walks the
// character at full WalkSpeed with controls intact, no Humanoid hijack),
// SendMouseButton feeds UIS and activates GUI buttons (and hit-tests against
// CoreGui), and SendTextInput types into the focused TextBox.
//
// Method set on the VirtualInput object (re-verified live 2026-09-28; the
// engine added the mouse and pointer ones after this handler was written):
//   SendKey(isDown: boolean, keyCode: Enum.KeyCode)
//   SendMouseButton(position: Vector2, inputType: Enum.UserInputType, isDown: boolean)
//   SendMousePosition(position: Vector2)   absolute move (errors over CoreGui)
//   SendMouseDelta(delta: Vector2)         relative move; only while the cursor is locked
//   SendPointerAction(position: Vector2, { Wheel?, Pan?, Pinch? })  wheel, trackpad pan, pinch
//   SendTextInput(text: string)
// SendMouseDelta is the one a game reading GetMouseDelta sees: ten deltas of
// -20 px with the cursor locked turned an aim by exactly what 200 real pixels do.
//
// Coordinate space: VirtualInput takes Camera.ViewportSize pixels (origin at the top-left of the
// rendered viewport, the top bar included). UserInputService reports input positions in GUI
// space, offset from this by GuiService:GetGuiInset() (~58px on the Y axis). A screenshot can
// have more pixels than the viewport (Retina, or a downscale), so the server maps x/y read off
// the last capture_screenshot to viewport pixels before they reach this handler.

import * as RenderMonitor from "../RenderMonitor";

const UserInputService = game.GetService("UserInputService");

interface PointerAction {
	Wheel?: number;
	Pan?: Vector2;
	Pinch?: number;
}

interface VirtualInput {
	SendKey(isDown: boolean, keyCode: Enum.KeyCode): void;
	SendMouseButton(position: Vector2, inputType: Enum.UserInputType, isDown: boolean): void;
	SendMousePosition(position: Vector2): void;
	SendMouseDelta(delta: Vector2): void;
	SendPointerAction(position: Vector2, action: PointerAction): void;
	SendTextInput(text: string): void;
}

// One VirtualInput per plugin VM, reused across calls so that a key held down
// in one call (action="press") and released in a later call (action="release")
// share the same input source.
let cachedVI: VirtualInput | undefined;

function getVI(): VirtualInput | undefined {
	if (cachedVI) return cachedVI;
	const [ok, vi] = pcall(() => {
		return (UserInputService as unknown as { CreateVirtualInput(): unknown }).CreateVirtualInput();
	});
	if (ok && vi !== undefined) {
		cachedVI = vi as VirtualInput;
		return cachedVI;
	}
	return undefined;
}

const MOUSE_TYPE_MAP: Record<string, Enum.UserInputType> = {
	Left: Enum.UserInputType.MouseButton1,
	Right: Enum.UserInputType.MouseButton2,
	Middle: Enum.UserInputType.MouseButton3,
};

function num(value: unknown): number | undefined {
	return typeIs(value, "number") ? value : undefined;
}

// Actions that happen at a point on the viewport need x and y; a delta does not.
const POSITIONED = new Set(["click", "mouseDown", "mouseUp", "move", "scroll", "pan", "pinch"]);

// One mouse action on `vi`. Throws (inside the caller's pcall) on a bad action.
function mouseAction(vi: VirtualInput, requestData: Record<string, unknown>) {
	const action = requestData.action as string;
	const x = num(requestData.x);
	const y = num(requestData.y);
	const button = (requestData.button as string) ?? "Left";
	const inputType = MOUSE_TYPE_MAP[button] ?? Enum.UserInputType.MouseButton1;
	if (POSITIONED.has(action) && (x === undefined || y === undefined)) {
		error(`x and y are required for ${action}`);
	}
	const pos = new Vector2(x ?? 0, y ?? 0);
	if (action === "click") {
		vi.SendMouseButton(pos, inputType, true);
		task.wait(0.05);
		vi.SendMouseButton(pos, inputType, false);
	} else if (action === "mouseDown") {
		vi.SendMouseButton(pos, inputType, true);
	} else if (action === "mouseUp") {
		vi.SendMouseButton(pos, inputType, false);
	} else if (action === "move") {
		vi.SendMousePosition(pos);
	} else if (action === "delta") {
		vi.SendMouseDelta(new Vector2(num(requestData.dx) ?? 0, num(requestData.dy) ?? 0));
	} else if (action === "scroll") {
		vi.SendPointerAction(pos, { Wheel: num(requestData.amount) ?? 1 });
	} else if (action === "pan") {
		vi.SendPointerAction(pos, { Pan: new Vector2(num(requestData.dx) ?? 0, num(requestData.dy) ?? 0) });
	} else if (action === "pinch") {
		vi.SendPointerAction(pos, { Pinch: num(requestData.amount) ?? 1 });
	} else {
		error(`Unsupported mouse action "${action}"`);
	}
}

function simulateMouseInput(requestData: Record<string, unknown>) {
	const action = requestData.action as string;
	if (!action) return { error: "action is required" };

	// Input is silently dropped by the engine when the window isn't rendering
	// (e.g. minimized). Surface that instead of returning a false success.
	const notRendering = RenderMonitor.notRenderingReason();
	if (notRendering !== undefined) return { error: notRendering };

	const vi = getVI();
	if (!vi) {
		return { error: "UserInputService:CreateVirtualInput() is not available in this context" };
	}

	const [success, err] = pcall(() => mouseAction(vi, requestData));
	if (success) {
		return { success: true, action, x: requestData.x, y: requestData.y, button: requestData.button ?? "Left" };
	}
	return { error: `Failed to simulate mouse input: ${err}` };
}

function simulateKeyboardInput(requestData: Record<string, unknown>) {
	const notRendering = RenderMonitor.notRenderingReason();
	if (notRendering !== undefined) return { error: notRendering };

	const vi = getVI();
	if (!vi) {
		return { error: "UserInputService:CreateVirtualInput() is not available in this context" };
	}

	// Text mode: type a string into the focused TextBox.
	const text = requestData.text as string | undefined;
	if (text !== undefined) {
		const [ok, err] = pcall(() => vi.SendTextInput(text));
		if (ok) return { success: true, text };
		return { error: `Failed to send text input: ${err}` };
	}

	const keyCodeName = requestData.keyCode as string;
	if (!keyCodeName) return { error: "keyCode (or text) is required" };

	const action = (requestData.action as string) ?? "tap";
	const duration = (requestData.duration as number) ?? 0.1;

	const [enumOk, keyCode] = pcall(() => {
		return (Enum.KeyCode as unknown as Record<string, Enum.KeyCode>)[keyCodeName];
	});
	if (!enumOk || !keyCode) {
		return {
			error: `Unknown keyCode: ${keyCodeName}. Use Enum.KeyCode names like "W", "Space", "E", "LeftShift", etc.`,
		};
	}

	const [success, err] = pcall(() => {
		if (action === "press") {
			vi.SendKey(true, keyCode);
		} else if (action === "release") {
			vi.SendKey(false, keyCode);
		} else if (action === "tap") {
			vi.SendKey(true, keyCode);
			task.wait(duration);
			vi.SendKey(false, keyCode);
		} else {
			error(`Unknown action: ${action}`);
		}
	});

	if (success) {
		return { success: true, keyCode: keyCodeName, action };
	}
	return { error: `Failed to simulate keyboard input: ${err}` };
}

// The longest a sequence may wait in all, seconds, so one call cannot hold the client for long.
const SEQUENCE_MOST_WAIT = 30;

// A whole list of input steps run in order inside the client, waits included, so their timing is
// the client's own (a tool call per step cost about 0.2 s each). Steps:
//   { type: "key", keyCode, down }              press (down=true) or release a key
//   { type: "mouse", action, x?, y?, ... }      any simulate_mouse_input action
//   { type: "text", text }                      type into the focused TextBox
//   { type: "wait", seconds }                   wait before the next step
// Stops at the first failing step and says which.
function simulateInputSequence(requestData: Record<string, unknown>) {
	const steps = requestData.steps as unknown;
	if (!typeIs(steps, "table")) return { error: "steps (an array) is required" };
	const list = steps as Record<string, unknown>[];

	const notRendering = RenderMonitor.notRenderingReason();
	if (notRendering !== undefined) return { error: notRendering };
	const vi = getVI();
	if (!vi) {
		return { error: "UserInputService:CreateVirtualInput() is not available in this context" };
	}

	let waited = 0;
	for (const step of list) {
		if (step.type === "wait") waited += num(step.seconds) ?? 0;
	}
	if (waited > SEQUENCE_MOST_WAIT) {
		return { error: `The steps wait ${waited} s in all; at most ${SEQUENCE_MOST_WAIT} s per call.` };
	}

	const started = os.clock();
	for (let i = 0; i < list.size(); i++) {
		const step = list[i];
		const [ok, err] = pcall(() => {
			if (step.type === "wait") {
				task.wait(num(step.seconds) ?? 0);
			} else if (step.type === "key") {
				const keyCode = (Enum.KeyCode as unknown as Record<string, Enum.KeyCode>)[step.keyCode as string];
				if (!keyCode) error(`Unknown keyCode: ${tostring(step.keyCode)}`);
				vi.SendKey(step.down !== false, keyCode);
			} else if (step.type === "mouse") {
				mouseAction(vi, step);
			} else if (step.type === "text") {
				vi.SendTextInput(tostring(step.text ?? ""));
			} else {
				error(`Unknown step type "${tostring(step.type)}"`);
			}
		});
		if (!ok) {
			return { error: `Step ${i + 1} (${tostring(step.type)}) failed: ${err}`, completed: i, elapsed: os.clock() - started };
		}
	}
	return { success: true, steps: list.size(), elapsed: os.clock() - started };
}

export = {
	simulateMouseInput,
	simulateKeyboardInput,
	simulateInputSequence,
};
