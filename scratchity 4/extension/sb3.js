// Scratchity — turns scratchblocks text into real Scratch 3 blocks.
// convert()   -> block objects (the format Scratch's VM uses in memory)
// makeSb3()   -> a downloadable .sb3 project (zip)
// makeSprite3() -> a .sprite3 zip, used to add a brand-new sprite to an open project
(function (root) {
  "use strict";

  // ---------- block table: scratchblocks id -> [opcode, args, fixedFields] ----------
  const num = (name, prim = 4) => ({ k: "num", name, prim });
  const txt = (name) => ({ k: "txt", name });
  const col = (name) => ({ k: "col", name });
  const bool = (name) => ({ k: "bool", name });
  const menu = (name, opcode, field = name, map, def = "") => ({ k: "menu", name, opcode, field, map, def });
  const field = (name, map, def = "") => ({ k: "field", name, map, def });
  const vfield = () => ({ k: "var", name: "VARIABLE", type: "" });
  const lfield = () => ({ k: "var", name: "LIST", type: "list" });
  const bfield = () => ({ k: "var", name: "BROADCAST_OPTION", type: "broadcast_msg" });
  const binput = (name) => ({ k: "bmenu", name });

  const SPECIAL = {
    "mouse-pointer": "_mouse_", "mouse pointer": "_mouse_", mouse: "_mouse_",
    "random position": "_random_", random: "_random_",
    edge: "_edge_", myself: "_myself_", stage: "_stage_",
  };
  const special = (v) => SPECIAL[String(v).trim().toLowerCase()] || v;
  const upper = (v) => String(v).toUpperCase().replace(/\s+/g, "");
  const lower = (v) => String(v).toLowerCase();
  const soundFx = (v) => (/pan/i.test(v) ? "PAN" : "PITCH");

  const T = {
    MOTION_MOVESTEPS: ["motion_movesteps", [num("STEPS")]],
    MOTION_TURNRIGHT: ["motion_turnright", [num("DEGREES")]],
    MOTION_TURNLEFT: ["motion_turnleft", [num("DEGREES")]],
    MOTION_POINTINDIRECTION: ["motion_pointindirection", [num("DIRECTION", 8)]],
    MOTION_POINTTOWARDS: ["motion_pointtowards", [menu("TOWARDS", "motion_pointtowards_menu", "TOWARDS", special, "_mouse_")]],
    MOTION_GOTOXY: ["motion_gotoxy", [num("X"), num("Y")]],
    MOTION_GOTO: ["motion_goto", [menu("TO", "motion_goto_menu", "TO", special, "_random_")]],
    MOTION_GLIDESECSTOXY: ["motion_glidesecstoxy", [num("SECS"), num("X"), num("Y")]],
    MOTION_GLIDETO: ["motion_glideto", [num("SECS"), menu("TO", "motion_glideto_menu", "TO", special, "_random_")]],
    MOTION_CHANGEXBY: ["motion_changexby", [num("DX")]],
    MOTION_SETX: ["motion_setx", [num("X")]],
    MOTION_CHANGEYBY: ["motion_changeyby", [num("DY")]],
    MOTION_SETY: ["motion_sety", [num("Y")]],
    MOTION_SETROTATIONSTYLE: ["motion_setrotationstyle", [field("STYLE", lower, "left-right")]],
    MOTION_IFONEDGEBOUNCE: ["motion_ifonedgebounce", []],
    MOTION_XPOSITION: ["motion_xposition", []],
    MOTION_YPOSITION: ["motion_yposition", []],
    MOTION_DIRECTION: ["motion_direction", []],

    LOOKS_SAYFORSECS: ["looks_sayforsecs", [txt("MESSAGE"), num("SECS")]],
    LOOKS_SAY: ["looks_say", [txt("MESSAGE")]],
    LOOKS_THINKFORSECS: ["looks_thinkforsecs", [txt("MESSAGE"), num("SECS")]],
    LOOKS_THINK: ["looks_think", [txt("MESSAGE")]],
    LOOKS_SHOW: ["looks_show", []],
    LOOKS_HIDE: ["looks_hide", []],
    LOOKS_SWITCHCOSTUMETO: ["looks_switchcostumeto", [menu("COSTUME", "looks_costume", "COSTUME", null, "costume1")]],
    LOOKS_NEXTCOSTUME: ["looks_nextcostume", []],
    LOOKS_NEXTBACKDROP_BLOCK: ["looks_nextbackdrop", []],
    LOOKS_SWITCHBACKDROPTO: ["looks_switchbackdropto", [menu("BACKDROP", "looks_backdrops", "BACKDROP", null, "backdrop1")]],
    LOOKS_SWITCHBACKDROPTOANDWAIT: ["looks_switchbackdroptoandwait", [menu("BACKDROP", "looks_backdrops", "BACKDROP", null, "backdrop1")]],
    LOOKS_CHANGEEFFECTBY: ["looks_changeeffectby", [field("EFFECT", upper, "COLOR"), num("CHANGE")]],
    LOOKS_SETEFFECTTO: ["looks_seteffectto", [field("EFFECT", upper, "COLOR"), num("VALUE")]],
    LOOKS_CLEARGRAPHICEFFECTS: ["looks_cleargraphiceffects", []],
    LOOKS_CHANGESIZEBY: ["looks_changesizeby", [num("CHANGE")]],
    LOOKS_SETSIZETO: ["looks_setsizeto", [num("SIZE")]],
    LOOKS_GOTOFRONTBACK: ["looks_gotofrontback", [field("FRONT_BACK", lower, "front")]],
    LOOKS_GOFORWARDBACKWARDLAYERS: ["looks_goforwardbackwardlayers", [field("FORWARD_BACKWARD", lower, "forward"), num("NUM", 7)]],
    LOOKS_COSTUMENUMBERNAME: ["looks_costumenumbername", [field("NUMBER_NAME", lower, "number")]],
    SENSING_OF_COSTUMENUMBER: ["looks_costumenumbername", [], { NUMBER_NAME: "number" }],
    LOOKS_SIZE: ["looks_size", []],
    LOOKS_BACKDROPNUMBERNAME: ["looks_backdropnumbername", [field("NUMBER_NAME", lower, "number")]],
    SENSING_OF_BACKDROPNAME: ["looks_backdropnumbername", [], { NUMBER_NAME: "name" }],
    SENSING_OF_BACKDROPNUMBER: ["looks_backdropnumbername", [], { NUMBER_NAME: "number" }],

    SOUND_PLAY: ["sound_play", [menu("SOUND_MENU", "sound_sounds_menu", "SOUND_MENU", null, "pop")]],
    SOUND_PLAYUNTILDONE: ["sound_playuntildone", [menu("SOUND_MENU", "sound_sounds_menu", "SOUND_MENU", null, "pop")]],
    SOUND_STOPALLSOUNDS: ["sound_stopallsounds", []],
    SOUND_CHANGEEFFECTBY: ["sound_changeeffectby", [field("EFFECT", soundFx, "PITCH"), num("VALUE")]],
    SOUND_SETEFFECTO: ["sound_seteffectto", [field("EFFECT", soundFx, "PITCH"), num("VALUE")]],
    SOUND_CLEAREFFECTS: ["sound_cleareffects", []],
    SOUND_CHANGEVOLUMEBY: ["sound_changevolumeby", [num("VOLUME")]],
    SOUND_SETVOLUMETO: ["sound_setvolumeto", [num("VOLUME")]],
    SOUND_VOLUME: ["sound_volume", []],

    "pen.clear": ["pen_clear", []],
    "pen.stamp": ["pen_stamp", []],
    "pen.penDown": ["pen_penDown", []],
    "pen.penUp": ["pen_penUp", []],
    "pen.setColor": ["pen_setPenColorToColor", [col("COLOR")]],
    "pen.changeColorParam": ["pen_changePenColorParamBy", [menu("COLOR_PARAM", "pen_menu_colorParam", "colorParam", lower, "color"), num("VALUE")]],
    "pen.setColorParam": ["pen_setPenColorParamTo", [menu("COLOR_PARAM", "pen_menu_colorParam", "colorParam", lower, "color"), num("VALUE")]],
    "pen.changeSize": ["pen_changePenSizeBy", [num("SIZE")]],
    "pen.setSize": ["pen_setPenSizeTo", [num("SIZE")]],
    "pen.changeHue": ["pen_changePenHueBy", [num("HUE")]],
    "pen.setHue": ["pen_setPenHueToNumber", [num("HUE")]],
    "pen.changeShade": ["pen_changePenShadeBy", [num("SHADE")]],
    "pen.setShade": ["pen_setPenShadeToNumber", [num("SHADE")]],

    EVENT_WHENFLAGCLICKED: ["event_whenflagclicked", []],
    EVENT_WHENKEYPRESSED: ["event_whenkeypressed", [field("KEY_OPTION", lower, "space")]],
    EVENT_WHENTHISSPRITECLICKED: ["event_whenthisspriteclicked", []],
    EVENT_WHENSTAGECLICKED: ["event_whenstageclicked", []],
    EVENT_WHENBACKDROPSWITCHESTO: ["event_whenbackdropswitchesto", [field("BACKDROP", null, "backdrop1")]],
    EVENT_WHENGREATERTHAN: ["event_whengreaterthan", [field("WHENGREATERTHANMENU", upper, "LOUDNESS"), num("VALUE")]],
    EVENT_WHENBROADCASTRECEIVED: ["event_whenbroadcastreceived", [bfield()]],
    EVENT_BROADCAST: ["event_broadcast", [binput("BROADCAST_INPUT")]],
    EVENT_BROADCASTANDWAIT: ["event_broadcastandwait", [binput("BROADCAST_INPUT")]],

    CONTROL_WAIT: ["control_wait", [num("DURATION", 5)]],
    CONTROL_REPEAT: ["control_repeat", [num("TIMES", 6)]],
    CONTROL_FOREVER: ["control_forever", []],
    CONTROL_IF: ["control_if", [bool("CONDITION")]],
    CONTROL_WAITUNTIL: ["control_wait_until", [bool("CONDITION")]],
    CONTROL_REPEATUNTIL: ["control_repeat_until", [bool("CONDITION")]],
    CONTROL_STOP: ["control_stop", [field("STOP_OPTION", lower, "all")]],
    CONTROL_STARTASCLONE: ["control_start_as_clone", []],
    CONTROL_CREATECLONEOF: ["control_create_clone_of", [menu("CLONE_OPTION", "control_create_clone_of_menu", "CLONE_OPTION", special, "_myself_")]],
    CONTROL_DELETETHISCLONE: ["control_delete_this_clone", []],

    SENSING_ASKANDWAIT: ["sensing_askandwait", [txt("QUESTION")]],
    SENSING_RESETTIMER: ["sensing_resettimer", []],
    SENSING_TOUCHINGOBJECT: ["sensing_touchingobject", [menu("TOUCHINGOBJECTMENU", "sensing_touchingobjectmenu", "TOUCHINGOBJECTMENU", special, "_mouse_")]],
    SENSING_TOUCHINGCOLOR: ["sensing_touchingcolor", [col("COLOR")]],
    SENSING_COLORISTOUCHINGCOLOR: ["sensing_coloristouchingcolor", [col("COLOR"), col("COLOR2")]],
    SENSING_DISTANCETO: ["sensing_distanceto", [menu("DISTANCETOMENU", "sensing_distancetomenu", "DISTANCETOMENU", special, "_mouse_")]],
    SENSING_ANSWER: ["sensing_answer", []],
    SENSING_KEYPRESSED: ["sensing_keypressed", [menu("KEY_OPTION", "sensing_keyoptions", "KEY_OPTION", lower, "space")]],
    SENSING_MOUSEDOWN: ["sensing_mousedown", []],
    SENSING_MOUSEX: ["sensing_mousex", []],
    SENSING_MOUSEY: ["sensing_mousey", []],
    SENSING_SETDRAGMODE: ["sensing_setdragmode", [field("DRAG_MODE", lower, "draggable")]],
    SENSING_LOUDNESS: ["sensing_loudness", []],
    SENSING_TIMER: ["sensing_timer", []],
    SENSING_OF: ["sensing_of", [field("PROPERTY", null, "x position"), menu("OBJECT", "sensing_of_object_menu", "OBJECT", special, "_stage_")]],
    SENSING_CURRENT: ["sensing_current", [field("CURRENTMENU", upper, "YEAR")]],
    SENSING_DAYSSINCE2000: ["sensing_dayssince2000", []],
    SENSING_USERNAME: ["sensing_username", []],

    OPERATORS_ADD: ["operator_add", [num("NUM1"), num("NUM2")]],
    OPERATORS_SUBTRACT: ["operator_subtract", [num("NUM1"), num("NUM2")]],
    OPERATORS_MULTIPLY: ["operator_multiply", [num("NUM1"), num("NUM2")]],
    OPERATORS_DIVIDE: ["operator_divide", [num("NUM1"), num("NUM2")]],
    OPERATORS_RANDOM: ["operator_random", [num("FROM"), num("TO")]],
    OPERATORS_LT: ["operator_lt", [txt("OPERAND1"), txt("OPERAND2")]],
    OPERATORS_EQUALS: ["operator_equals", [txt("OPERAND1"), txt("OPERAND2")]],
    OPERATORS_GT: ["operator_gt", [txt("OPERAND1"), txt("OPERAND2")]],
    OPERATORS_AND: ["operator_and", [bool("OPERAND1"), bool("OPERAND2")]],
    OPERATORS_OR: ["operator_or", [bool("OPERAND1"), bool("OPERAND2")]],
    OPERATORS_NOT: ["operator_not", [bool("OPERAND")]],
    OPERATORS_JOIN: ["operator_join", [txt("STRING1"), txt("STRING2")]],
    OPERATORS_LETTEROF: ["operator_letter_of", [num("LETTER", 6), txt("STRING")]],
    OPERATORS_LENGTH: ["operator_length", [txt("STRING")]],
    OPERATORS_CONTAINS: ["operator_contains", [txt("STRING1"), txt("STRING2")]],
    OPERATORS_MOD: ["operator_mod", [num("NUM1"), num("NUM2")]],
    OPERATORS_ROUND: ["operator_round", [num("NUM")]],
    OPERATORS_MATHOP: ["operator_mathop", [field("OPERATOR", lower, "abs"), num("NUM")]],

    DATA_SETVARIABLETO: ["data_setvariableto", [vfield(), txt("VALUE")]],
    DATA_CHANGEVARIABLEBY: ["data_changevariableby", [vfield(), num("VALUE")]],
    DATA_SHOWVARIABLE: ["data_showvariable", [vfield()]],
    DATA_HIDEVARIABLE: ["data_hidevariable", [vfield()]],
    DATA_ADDTOLIST: ["data_addtolist", [txt("ITEM"), lfield()]],
    DATA_DELETEOFLIST: ["data_deleteoflist", [num("INDEX", 7), lfield()]],
    DATA_DELETEALLOFLIST: ["data_deletealloflist", [lfield()]],
    DATA_INSERTATLIST: ["data_insertatlist", [txt("ITEM"), num("INDEX", 7), lfield()]],
    DATA_REPLACEITEMOFLIST: ["data_replaceitemoflist", [num("INDEX", 7), lfield(), txt("ITEM")]],
    DATA_ITEMOFLIST: ["data_itemoflist", [num("INDEX", 7), lfield()]],
    DATA_ITEMNUMOFLIST: ["data_itemnumoflist", [txt("ITEM"), lfield()]],
    DATA_LENGTHOFLIST: ["data_lengthoflist", [lfield()]],
    DATA_LISTCONTAINSITEM: ["data_listcontainsitem", [lfield(), txt("ITEM")]],
    DATA_SHOWLIST: ["data_showlist", [lfield()]],
    DATA_HIDELIST: ["data_hidelist", [lfield()]],
  };

  const HAT_OPCODES = new Set([
    "event_whenflagclicked", "event_whenkeypressed", "event_whenthisspriteclicked", "event_whenstageclicked",
    "event_whenbackdropswitchesto", "event_whengreaterthan", "event_whenbroadcastreceived",
    "control_start_as_clone", "procedures_definition",
  ]);

  // The AI often writes hat blocks in words Scratch doesn't use ("when green flag is clicked",
  // "when space key pressed"). Those don't parse as hats, so the script would never start.
  // Rewrite them to Scratch's exact wording first. Also pull out a "Sprite: Name" line put
  // inside the code block.
  function normalizeCode(code) {
    let sprite = null;
    const keyName = (k) => k.replace(/^[\[(]|[\])]$/g, "").replace(/\s+v$/i, "").trim().toLowerCase();
    const out = [];
    for (const line of String(code).split("\n")) {
      const indent = line.match(/^\s*/)[0];
      let t = line.trim().replace(/[:;.]+$/, "");
      const label = t.match(/^[*_#\s]*(sprite|stage)\b[*_\s]*[:\-\u2013]?\s*([^*]*?)[*_\s]*$/i);
      if (label && out.every((l) => !l.trim())) {
        const name = label[2].trim();
        if (/^stage$/i.test(label[1])) { sprite = "Stage"; continue; }
        if (name && !/[()<>\[\]]/.test(name)) { sprite = name; continue; }
      }
      let m;
      if (/^when\s+(the\s+)?(green\s+)?(\[?\s*(green\s+)?flag\s*(v\s*)?\]?|\u{1F3C1}|gf)\s+(is\s+)?(clicked|pressed|tapped)$/iu.test(t)) t = "when flag clicked";
      else if (/^when\s+(the\s+)?program\s+starts$/i.test(t)) t = "when flag clicked";
      else if ((m = t.match(/^when\s+(?:the\s+)?(?:key\s+)?(.+?)\s+key\s+(?:is\s+)?pressed$/i)) && !/^\[[^\]]*\s+v\]$/i.test(m[1])) t = `when [${keyName(m[1])} v] key pressed`;
      else if ((m = t.match(/^when\s+key\s+(.+?)\s+(?:is\s+)?pressed$/i))) t = `when [${keyName(m[1])} v] key pressed`;
      else if (/^when\s+(this\s+)?sprite\s+(is\s+)?clicked$/i.test(t)) t = "when this sprite clicked";
      else if (/^when\s+(the\s+)?stage\s+(is\s+)?clicked$/i.test(t)) t = "when stage clicked";
      else if (/^when\s+i\s+start\s+as\s+(a\s+)?clone$/i.test(t)) t = "when I start as a clone";
      else if ((m = t.match(/^when\s+i\s+(?:receive|get)\s+(.+)$/i)) && !/^\[.*\]$/.test(m[1].trim())) t = `when I receive [${keyName(m[1]).replace(/^["']|["']$/g, "")} v]`;
      else { out.push(line); continue; }
      out.push(indent + t);
    }
    return { code: out.join("\n"), sprite };
  }

  const C_BLOCKS = new Set(["control_repeat", "control_forever", "control_if", "control_if_else", "control_repeat_until"]);
  const PRIM_OPCODE = { 4: "math_number", 5: "math_positive_number", 6: "math_whole_number", 7: "math_integer", 8: "math_angle" };

  const SOUP = "!#%()*+,-./:;=?@[]^_`{|}~ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const uid = () => Array.from({ length: 20 }, () => SOUP[(Math.random() * SOUP.length) | 0]).join("");

  // ---------- convert ----------
  // scripts: [{ sprite: "Player" | "Stage" | null, code: "scratchblocks text" }]
  // scripts: [{ sprite, code }]   art: [{ sprite, name, svg }] (costumes, or backdrops for the Stage)
  function convert(scripts, art = []) {
    const sb = root.scratchblocks;
    if (!sb || !sb.parse) throw new Error("scratchblocks isn't loaded.");

    const vars = new Map(); // "type\u0000name" -> {id, name, type}
    const warnings = [];
    let fixes = 0; // blocks moved or dropped because Scratch can't connect them that way
    let hatsAdded = 0; // scripts with no hat got "when flag clicked" so they actually run
    let usesPen = false;
    const variable = (name, type) => {
      name = String(name ?? "").trim() || (type === "list" ? "my list" : type === "broadcast_msg" ? "message1" : "my variable");
      const key = type + "\u0000" + name;
      if (!vars.has(key)) vars.set(key, { id: uid(), name, type });
      return vars.get(key);
    };

    // group scripts by sprite
    const groups = new Map();
    for (const s0 of scripts) {
      const n = normalizeCode(s0.code);
      const s = { sprite: s0.sprite || n.sprite, code: n.code };
      const raw = (s.sprite || "").trim();
      const isStage = /^(the\s+)?stage$/i.test(raw);
      const key = isStage ? "#stage" : raw ? raw.toLowerCase() : "#current";
      if (!groups.has(key)) groups.set(key, { name: isStage ? "Stage" : raw, isStage, isCurrent: !raw && !isStage, codes: [] });
      groups.get(key).codes.push(s.code);
    }

    // Drawings go to the same sprite groups (a sprite can have drawings and no scripts).
    const groupFor = (rawName) => {
      const raw = (rawName || "").trim();
      const isStage = /^(the\s+)?stage$/i.test(raw);
      const key = isStage ? "#stage" : raw ? raw.toLowerCase() : "#current";
      if (!groups.has(key)) groups.set(key, { name: isStage ? "Stage" : raw, isStage, isCurrent: !raw && !isStage, codes: [] });
      return groups.get(key);
    };
    let drawings = 0;
    for (const a of art) {
      const g = groupFor(a.sprite);
      const clean = cleanSvg(a.svg, g.isStage);
      if (!clean) { warnings.push(`Couldn't use a drawing for ${g.isStage ? "the Stage" : g.name || "a sprite"}, so it gets a plain placeholder.`); continue; }
      g.art = g.art || [];
      const name = String(a.name || "").trim() || `${g.isStage ? "backdrop" : "costume"}${g.art.length + 1}`;
      const at = g.art.findIndex((x) => x.name.toLowerCase() === name.toLowerCase());
      if (at >= 0) g.art[at] = { name: g.art[at].name, ...clean }; else g.art.push({ name, ...clean });
      drawings++;
    }

    const sprites = [];
    for (const g of groups.values()) {
      const blocks = new Map();
      const costumes = new Set();
      const backdrops = new Set();
      const procs = new Map(); // proccode -> {ids, names, types}
      const doc = sb.parse(g.codes.join("\n\n") || "", { languages: ["en"] });

      const mk = (opcode, parent, shadow = false) => {
        const b = { id: uid(), opcode, next: null, parent: parent || null, inputs: {}, fields: {}, shadow, topLevel: false };
        blocks.set(b.id, b);
        return b;
      };
      const setInput = (b, name, block, shadow) => { b.inputs[name] = { name, block: block || null, shadow: shadow || null }; };
      const setField = (b, name, value, extra) => { b.fields[name] = Object.assign({ name, value: String(value) }, extra || {}); };
      const isBlock = (n) => n && n.isBlock;
      const argNodes = (node) => node.children.filter((c) => c.isInput || c.isBlock);
      const labelText = (node) => node.children.filter((c) => c.isLabel).map((c) => c.value).join(" ");

      // Collect custom block definitions first so calls can match their argument ids.
      for (const script of doc.scripts) {
        const first = script.blocks[0];
        if (first && first.info && first.info.id === "PROCEDURES_DEFINITION") {
          const outline = first.children.find((c) => c.isBlock);
          if (!outline) continue;
          const parts = [], ids = [], names = [], types = [];
          for (const c of outline.children) {
            if (c.isLabel) parts.push(c.value.replace(/%/g, "\\%"));
            else if (c.isBlock) {
              const t = c.info.shape === "boolean" ? "%b" : "%s";
              parts.push(t); ids.push(uid()); names.push(labelText(c)); types.push(t);
            } else if (c.isInput) {
              parts.push("%s"); ids.push(uid()); names.push(String(c.value || "input")); types.push("%s");
            }
          }
          procs.set(parts.join(" "), { ids, names, types, proccode: parts.join(" ") });
        }
      }

      // Scripts that had to be split off (a hat mid-script, blocks after "forever", loose reporters).
      const pendingTops = [];
      const HAT_SHAPES = new Set(["hat", "define-hat"]);
      const VALUE_SHAPES = new Set(["reporter", "boolean", "ring"]);
      const CAPS = new Set(["control_forever", "control_delete_this_clone"]);
      const isCap = (b) => CAPS.has(b.opcode) || (b.opcode === "control_stop" && b.mutation && b.mutation.hasnext === "false");

      function chain(nodes, parent) {
        let firstId = null, prev = null;
        const list = nodes.filter(isBlock);
        for (let i = 0; i < list.length; i++) {
          const node = list[i];
          const shape = (node.info && node.info.shape) || "";
          // A hat can only start a script.
          if (HAT_SHAPES.has(shape) && (prev || parent)) { pendingTops.push(list.slice(i)); fixes++; break; }
          // A reporter on its own line: keep it as a loose block, carry on without it.
          if (VALUE_SHAPES.has(shape)) { pendingTops.push([node]); fixes++; continue; }
          const b = convBlock(node, prev ? prev.id : parent);
          if (!b) continue;
          if (prev) prev.next = b.id; else firstId = b.id;
          prev = b;
          // Nothing can attach under forever / stop all / delete this clone.
          if (isCap(b) && i < list.length - 1) { pendingTops.push(list.slice(i + 1)); fixes++; break; }
        }
        return firstId;
      }
      const shapeOf = (node) => (node && node.info && node.info.shape) || "";
      const fitsRound = (node) => !isBlock(node) || VALUE_SHAPES.has(shapeOf(node));
      const fitsPointy = (node) => isBlock(node) && shapeOf(node) === "boolean";

      function primShadow(prim, value, parent) {
        if (prim === "txt") { const s = mk("text", parent, true); setField(s, "TEXT", value); return s; }
        if (prim === "col") {
          const s = mk("colour_picker", parent, true);
          setField(s, "COLOUR", /^#[0-9a-f]{6}$/i.test(value) ? value : "#ff0000");
          return s;
        }
        const s = mk(PRIM_OPCODE[prim] || "math_number", parent, true);
        setField(s, "NUM", value);
        return s;
      }

      function applyArg(a, node, b) {
        const lit = node && node.isInput ? node.value ?? "" : "";
        switch (a.k) {
          case "num": case "txt": case "col": {
            const shadow = primShadow(a.k === "num" ? a.prim : a.k, lit, b.id);
            if (!fitsRound(node)) fixes++;
            const child = isBlock(node) && fitsRound(node) ? convBlock(node, b.id) : null;
            setInput(b, a.name, child ? child.id : shadow.id, shadow.id);
            break;
          }
          case "bool": {
            if (isBlock(node) && !fitsPointy(node)) fixes++;
            const child = fitsPointy(node) ? convBlock(node, b.id) : null;
            if (child) setInput(b, a.name, child.id, null);
            break;
          }
          case "menu": {
            let v = lit !== "" ? lit : a.def;
            if (a.map) v = a.map(v);
            const m = mk(a.opcode, b.id, true);
            setField(m, a.field, v);
            if (a.opcode === "looks_costume") costumes.add(v);
            if (a.opcode === "looks_backdrops") backdrops.add(v);
            if (!fitsRound(node)) fixes++;
            const child = isBlock(node) && fitsRound(node) ? convBlock(node, b.id) : null;
            setInput(b, a.name, child ? child.id : m.id, m.id);
            break;
          }
          case "field": {
            let v = lit !== "" ? lit : a.def;
            if (a.map) v = a.map(v);
            setField(b, a.name, v);
            if (a.name === "BACKDROP") backdrops.add(v);
            break;
          }
          case "var": {
            const v = variable(lit, a.type);
            setField(b, a.name, v.name, { id: v.id, variableType: a.type });
            break;
          }
          case "bmenu": {
            const v = variable(lit, "broadcast_msg");
            const m = mk("event_broadcast_menu", b.id, true);
            setField(m, "BROADCAST_OPTION", v.name, { id: v.id, variableType: "broadcast_msg" });
            const child = isBlock(node) && fitsRound(node) ? convBlock(node, b.id) : null;
            setInput(b, a.name, child ? child.id : m.id, m.id);
            break;
          }
        }
      }

      function convBlock(node, parent) {
        const info = node.info || {};
        const id = info.id;

        if (id === "PROCEDURES_DEFINITION") return convDefine(node, parent);
        if (id === "PROCEDURES_CALL" || info.selector === "call") return convCall(node, parent);

        if (info.selector === "readVariable") {
          const v = variable(labelText(node), "");
          const b = mk("data_variable", parent);
          setField(b, "VARIABLE", v.name, { id: v.id, variableType: "" });
          return b;
        }
        if (info.category === "custom-arg") {
          const b = mk(info.shape === "boolean" ? "argument_reporter_boolean" : "argument_reporter_string_number", parent);
          setField(b, "VALUE", labelText(node));
          return b;
        }
        if (info.category === "list" && !id) {
          const v = variable(labelText(node), "list");
          const b = mk("data_listcontents", parent);
          setField(b, "LIST", v.name, { id: v.id, variableType: "list" });
          return b;
        }

        const spec = T[id];
        if (!spec) {
          const text = node.children.map((c) => (c.isLabel ? c.value : "…")).join(" ").trim();
          if (text && text !== "…") warnings.push(`Skipped a block Scratch doesn't have: "${text}"`);
          // keep whatever was nested inside it, if anything
          return null;
        }
        const [opcode, args, fixed] = spec;
        if (opcode.startsWith("pen_")) usesPen = true;
        const b = mk(opcode, parent);
        const nodes = argNodes(node);
        args.forEach((a, i) => applyArg(a, nodes[i], b));
        if (fixed) for (const [k, v] of Object.entries(fixed)) setField(b, k, v);

        if (C_BLOCKS.has(opcode)) {
          const subs = node.children.filter((c) => c.isScript);
          if (opcode === "control_if" && subs.length > 1) b.opcode = "control_if_else";
          subs.slice(0, 2).forEach((s, i) => {
            const first = chain(s.blocks, b.id);
            if (first) setInput(b, i ? "SUBSTACK2" : "SUBSTACK", first, null);
          });
        }
        if (opcode === "control_stop") {
          const opt = b.fields.STOP_OPTION.value;
          b.mutation = { tagName: "mutation", children: [], hasnext: /other scripts/.test(opt) ? "true" : "false" };
        }
        return b;
      }

      function convDefine(node, parent) {
        const outline = node.children.find((c) => c.isBlock);
        const parts = [];
        if (outline) for (const c of outline.children) {
          if (c.isLabel) parts.push(c.value.replace(/%/g, "\\%"));
          else if (c.isBlock) parts.push(c.info.shape === "boolean" ? "%b" : "%s");
          else if (c.isInput) parts.push("%s");
        }
        const proc = procs.get(parts.join(" ")) || { ids: [], names: [], types: [], proccode: parts.join(" ") };
        const def = mk("procedures_definition", parent);
        const proto = mk("procedures_prototype", def.id, true);
        proc.ids.forEach((argId, i) => {
          const r = mk(proc.types[i] === "%b" ? "argument_reporter_boolean" : "argument_reporter_string_number", proto.id, true);
          setField(r, "VALUE", proc.names[i]);
          setInput(proto, argId, r.id, r.id);
        });
        proto.mutation = {
          tagName: "mutation", children: [], proccode: proc.proccode,
          argumentids: JSON.stringify(proc.ids), argumentnames: JSON.stringify(proc.names),
          argumentdefaults: JSON.stringify(proc.types.map((t) => (t === "%b" ? "false" : ""))), warp: "false",
        };
        setInput(def, "custom_block", proto.id, proto.id);
        return def;
      }

      function convCall(node, parent) {
        const parts = [], args = [];
        for (const c of node.children) {
          if (c.isLabel) parts.push(c.value.replace(/%/g, "\\%"));
          else if (c.isInput || c.isBlock) {
            const isB = c.isInput ? c.shape === "boolean" : c.info.shape === "boolean";
            parts.push(isB ? "%b" : "%s");
            args.push({ node: c, isB });
          }
        }
        const proccode = parts.join(" ");
        const proc = procs.get(proccode);
        const ids = proc ? proc.ids : args.map(() => uid());
        const b = mk("procedures_call", parent);
        b.mutation = { tagName: "mutation", children: [], proccode, argumentids: JSON.stringify(ids), warp: "false" };
        args.forEach((a, i) => {
          if (a.isB) {
            const child = fitsPointy(a.node) ? convBlock(a.node, b.id) : null;
            if (child) setInput(b, ids[i], child.id, null);
          } else {
            const shadow = primShadow("txt", a.node.isInput ? a.node.value ?? "" : "", b.id);
            const child = isBlock(a.node) && fitsRound(a.node) ? convBlock(a.node, b.id) : null;
            setInput(b, ids[i], child ? child.id : shadow.id, shadow.id);
          }
        });
        return b;
      }

      // Lay scripts out top to bottom.
      let y = 0, count = 0;
      // scratchblocks splits a script around a reporter sitting on its own line:
      // [hat, a] [(reporter)] [b] -> rejoin as [hat, a, b] plus a loose (reporter).
      const raw = doc.scripts.map((sc) => sc.blocks.filter(isBlock)).filter((l) => l.length);
      const queue = [];
      const afterCap = new Set(); // scripts that sat under a forever / stop / delete this clone
      const CAP_IDS = new Set(["CONTROL_FOREVER", "CONTROL_DELETETHISCLONE", "CONTROL_STOP"]);
      for (let i = 0; i < raw.length; i++) {
        const prev = raw[i - 1];
        if (prev && CAP_IDS.has(prev[prev.length - 1].info && prev[prev.length - 1].info.id)) afterCap.add(queue.length);
        const lone = raw[i].length === 1 && VALUE_SHAPES.has(shapeOf(raw[i][0]));
        const next = raw[i + 1];
        if (lone && queue.length && next && !HAT_SHAPES.has(shapeOf(next[0])) && !VALUE_SHAPES.has(shapeOf(next[0]))) {
          pendingTops.push(raw[i]);
          fixes++;
          queue[queue.length - 1] = queue[queue.length - 1].concat(next);
          i++;
          continue;
        }
        queue.push(raw[i]);
      }
      const fromAI = queue.length; // scripts the AI wrote (later ones are pieces Scratchity split off)
      for (let qi = 0; qi < queue.length || pendingTops.length; qi++) {
        if (qi >= queue.length) queue.push(pendingTops.shift());
        const nodes = queue[qi];
        const before = blocks.size;
        let first;
        if (nodes.length === 1 && VALUE_SHAPES.has(shapeOf(nodes[0]))) {
          const r = convBlock(nodes[0], null); // a loose reporter, allowed on its own in Scratch
          first = r && r.id;
        } else {
          first = chain(nodes, null);
        }
        if (!first) continue;
        let top = blocks.get(first);
        // A script with no hat never runs in Scratch. Give the AI's hatless scripts a green flag.
        const loose = nodes.length === 1 && VALUE_SHAPES.has(shapeOf(nodes[0]));
        if (qi < fromAI && !afterCap.has(qi) && !loose && !HAT_OPCODES.has(top.opcode)) {
          const hat = mk("event_whenflagclicked", null);
          hat.next = top.id;
          top.parent = hat.id;
          top = hat;
          hatsAdded++;
        }
        top.topLevel = true;
        top.x = 0;
        top.y = y;
        count++;
        const added = [...blocks.values()].slice(before).filter((b) => !b.shadow).length;
        y += added * 44 + 80;
      }

      sprites.push({
        name: g.name, isStage: g.isStage, isCurrent: g.isCurrent,
        blocks: [...blocks.values()], scriptCount: count,
        costumes: [...costumes].filter(Boolean), backdrops: [...backdrops].filter(Boolean),
        art: g.art || [],
      });
    }

    return { sprites, variables: [...vars.values()], usesPen, warnings, fixes, hatsAdded, drawings };
  }

  // ---------- serialize block objects to the compact .sb3 form ----------
  const PRIM_CODE = { math_number: 4, math_positive_number: 5, math_whole_number: 6, math_integer: 7, math_angle: 8, colour_picker: 9, text: 10 };

  function serializeBlocks(list) {
    const byId = new Map(list.map((b) => [b.id, b]));
    const prim = (id) => {
      const b = byId.get(id);
      if (!b || b.topLevel) return null;
      if (b.opcode in PRIM_CODE && b.shadow) return [PRIM_CODE[b.opcode], Object.values(b.fields)[0].value];
      if (b.opcode === "event_broadcast_menu" && b.shadow) return [11, b.fields.BROADCAST_OPTION.value, b.fields.BROADCAST_OPTION.id];
      if (b.opcode === "data_variable") return [12, b.fields.VARIABLE.value, b.fields.VARIABLE.id];
      if (b.opcode === "data_listcontents") return [13, b.fields.LIST.value, b.fields.LIST.id];
      return null;
    };
    const ref = (id) => prim(id) || id;
    const out = {};
    for (const b of list) {
      if (prim(b.id)) continue;
      const o = { opcode: b.opcode, next: b.next, parent: b.parent, inputs: {}, fields: {}, shadow: b.shadow, topLevel: b.topLevel };
      if (b.topLevel) { o.x = b.x || 0; o.y = b.y || 0; }
      if (b.mutation) o.mutation = b.mutation;
      for (const [k, inp] of Object.entries(b.inputs)) {
        if (inp.block && inp.shadow && inp.block !== inp.shadow) o.inputs[k] = [3, ref(inp.block), ref(inp.shadow)];
        else if (inp.shadow) o.inputs[k] = [1, ref(inp.shadow)];
        else if (inp.block) o.inputs[k] = [2, ref(inp.block)];
      }
      for (const [k, f] of Object.entries(b.fields)) o.fields[k] = f.id !== undefined ? [f.value, f.id] : [f.value, null];
      out[b.id] = o;
    }
    return out;
  }

  // ---------- costumes ----------
  const PALETTE = ["#4c97ff", "#9966ff", "#ff8c1a", "#59c059", "#ff6680", "#5cb1d6", "#ffab19", "#cf63cf"];
  const escXml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const enc = (s) => new TextEncoder().encode(s);

  // Drawn costumes first (in the order the AI drew them), then plain placeholders for any
  // costume the scripts mention that wasn't drawn.
  function withArt(art, names, makePlaceholder) {
    art = art || [];
    const out = art.map((a) => asset(a.name, a.svg, a.cx, a.cy));
    const have = new Set(art.map((a) => a.name.toLowerCase()));
    const missing = names.filter((n) => !have.has(String(n).toLowerCase()));
    if (missing.length || !out.length) out.push(...makePlaceholder(missing, out.length));
    return out;
  }

  function spriteCostumes(spriteName, names, seed, art) {
    return withArt(art, names, (missing, already) => placeholderCostumes(spriteName, missing.length || already ? missing : ["costume1"], seed));
  }

  function placeholderCostumes(spriteName, list, seed) {
    const letter = (spriteName || "S").trim().charAt(0).toUpperCase() || "S";
    return list.map((name, i) => {
      const color = PALETTE[(seed + i) % PALETTE.length];
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="44" fill="${color}" stroke="#ffffff" stroke-width="4"/><text x="48" y="63" font-family="Sans Serif" font-size="42" font-weight="bold" text-anchor="middle" fill="#ffffff">${escXml(letter)}</text></svg>`;
      return asset(name, svg, 48, 48);
    });
  }

  function stageBackdrops(names, art) {
    return withArt(art, names, (missing, already) => placeholderBackdrops(missing.length || already ? missing : ["backdrop1"]));
  }

  function placeholderBackdrops(list) {
    const tints = ["#ffffff", "#e9f1ff", "#fff4d6", "#eafbe7", "#f3ecff", "#ffecef"];
    return list.map((name, i) => {
      const label = list.length > 1 ? `<text x="240" y="340" font-family="Sans Serif" font-size="16" text-anchor="middle" fill="#9197a8">${escXml(name)}</text>` : "";
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360"><rect width="480" height="360" fill="${tints[i % tints.length]}"/>${label}</svg>`;
      return asset(name, svg, 240, 180);
    });
  }

  // ---------- drawings from the AI ----------
  // Makes an AI-written SVG safe and usable in Scratch: no scripts, event handlers or outside
  // links, a namespace, and a real width/height. Returns null if it isn't usable.
  function cleanSvg(svg, isStage) {
    let t = String(svg || "").trim().replace(/^<\?xml[^>]*>\s*/i, "").replace(/<!DOCTYPE[^>]*>\s*/i, "");
    const start = t.search(/<svg[\s>]/i), end = t.toLowerCase().lastIndexOf("</svg>");
    if (start < 0 || end < start) return null;
    t = t.slice(start, end + 6);
    t = t.replace(/<script[\s\S]*?<\/script\s*>/gi, "").replace(/<script[^>]*\/>/gi, "")
      .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\s(?:xlink:)?href\s*=\s*("|')\s*(?!#|data:image\/)[^"']*\1/gi, "")
      .replace(/@import[^;]*;?/gi, "").replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, "none");

    const open = t.match(/^<svg\b[^>]*>/i)[0];
    const attr = (n) => { const m = open.match(new RegExp(`\\s${n}\\s*=\\s*["']([^"']*)["']`, "i")); return m ? m[1] : null; };
    const vb = (attr("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    let w = parseFloat(attr("width")), h = parseFloat(attr("height"));
    if (/%/.test(attr("width") || "")) w = NaN;
    if (/%/.test(attr("height") || "")) h = NaN;
    if (!(w > 0) || !(h > 0)) {
      if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { w = vb[2]; h = vb[3]; }
      else { w = isStage ? 480 : 100; h = isStage ? 360 : 100; }
    }
    if (isStage) { // backdrops always fill the 480x360 stage
      const box = vb.length === 4 && vb[2] > 0 ? vb.join(" ") : `0 0 ${w} ${h}`;
      w = 480; h = 360;
      var viewBox = box;
    }
    let head = open.replace(/\s(width|height|xmlns|preserveAspectRatio)\s*=\s*("[^"]*"|'[^']*')/gi, "");
    if (isStage) head = head.replace(/\sviewBox\s*=\s*("[^"]*"|'[^']*')/i, "");
    head = head.replace(/^<svg\b/i, `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"` +
      (isStage ? ` viewBox="${viewBox}" preserveAspectRatio="xMidYMid slice"` : ""));
    if (!/xmlns:xlink/.test(head) && /xlink:/.test(t)) head = head.replace(/^<svg\b/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    t = head + t.slice(open.length);

    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(t, "image/svg+xml");
      if (doc.getElementsByTagName("parsererror").length || doc.documentElement.nodeName.toLowerCase() !== "svg") return null;
      if (!doc.documentElement.childElementCount) return null;
    }
    if (t.length > 200000) return null;
    return { svg: t, cx: w / 2, cy: h / 2 };
  }

  function asset(name, svg, cx, cy) {
    const bytes = enc(svg);
    const id = md5(bytes);
    return {
      json: { name, bitmapResolution: 1, dataFormat: "svg", assetId: id, md5ext: `${id}.svg`, rotationCenterX: cx, rotationCenterY: cy },
      file: { name: `${id}.svg`, bytes },
    };
  }

  function spriteTarget(sp, layer, costumes) {
    return {
      isStage: false, name: sp.name || "Sprite1", variables: {}, lists: {}, broadcasts: {},
      blocks: serializeBlocks(sp.blocks), comments: {}, currentCostume: 0,
      costumes: costumes.map((c) => c.json), sounds: [], volume: 100, layerOrder: layer,
      visible: true, x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: "all around",
    };
  }

  // ---------- .sb3 ----------
  function makeSb3(converted) {
    const files = [];
    const stageGroup = converted.sprites.find((s) => s.isStage);
    let sprites = converted.sprites.filter((s) => !s.isStage).map((s) => ({ ...s, name: s.name || "Sprite1" }));
    if (!sprites.length) sprites = [{ name: "Sprite1", blocks: [], costumes: [] }];

    const vars = {}, lists = {}, broadcasts = {};
    for (const v of converted.variables) {
      if (v.type === "list") lists[v.id] = [v.name, []];
      else if (v.type === "broadcast_msg") broadcasts[v.id] = v.name;
      else vars[v.id] = [v.name, 0];
    }

    const backdrops = stageBackdrops(
      converted.sprites.flatMap((s) => s.backdrops || []).filter((v, i, a) => a.indexOf(v) === i),
      stageGroup ? stageGroup.art : [],
    );
    backdrops.forEach((c) => files.push(c.file));
    const stage = {
      isStage: true, name: "Stage", variables: vars, lists, broadcasts,
      blocks: stageGroup ? serializeBlocks(stageGroup.blocks) : {}, comments: {}, currentCostume: 0,
      costumes: backdrops.map((c) => c.json), sounds: [], volume: 100, layerOrder: 0,
      tempo: 60, videoTransparency: 50, videoState: "on", textToSpeechLanguage: null,
    };

    const targets = [stage];
    sprites.forEach((sp, i) => {
      const costumes = spriteCostumes(sp.name, sp.costumes || [], i, sp.art);
      costumes.forEach((c) => files.push(c.file));
      targets.push(spriteTarget(sp, i + 1, costumes));
    });

    const project = {
      targets, monitors: [], extensions: converted.usesPen ? ["pen"] : [],
      meta: { semver: "3.0.0", vm: "0.2.0", agent: "Scratchity" },
    };
    files.unshift({ name: "project.json", bytes: enc(JSON.stringify(project)) });
    return zip(dedupe(files));
  }

  // A sprite with no scripts (blocks get added separately), used to create missing sprites in the editor.
  function makeSprite3(name, costumeNames, seed = 0, art = []) {
    const costumes = spriteCostumes(name, costumeNames || [], seed, art);
    const sprite = spriteTarget({ name, blocks: [] }, 1, costumes);
    delete sprite.layerOrder;
    return zip(dedupe([{ name: "sprite.json", bytes: enc(JSON.stringify(sprite)) }, ...costumes.map((c) => c.file)]));
  }

  const dedupe = (files) => files.filter((f, i) => files.findIndex((g) => g.name === f.name) === i);

  // ---------- zip (stored, no compression) ----------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

  function zip(files) {
    const parts = [], central = [];
    let offset = 0;
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = enc(f.name), crc = crc32(f.bytes), size = f.bytes.length;
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
      h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, f.bytes);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true); c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true);
      c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + size;
    }
    const cdSize = central.reduce((n, p) => n + p.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(e.buffer)];
    const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of all) { out.set(p, o); o += p.length; }
    return out;
  }

  // ---------- md5 (Scratch names assets by their md5) ----------
  function md5(bytes) {
    const K = new Uint32Array(64), S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
    const len = bytes.length, total = (((len + 8) >> 6) + 1) * 64;
    const buf = new Uint8Array(total);
    buf.set(bytes); buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, (len * 8) >>> 0, true);
    dv.setUint32(total - 4, Math.floor(len / 0x20000000), true);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let off = 0; off < total; off += 64) {
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        const s = S[(i >> 4) * 4 + (i % 4)];
        F = (F + A + K[i] + dv.getUint32(off + g * 4, true)) >>> 0;
        A = D; D = C; C = B;
        B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    return [a0, b0, c0, d0].map((w) => [0, 8, 16, 24].map((s) => ((w >>> s) & 0xff).toString(16).padStart(2, "0")).join("")).join("");
  }

  root.ScratchityBlocks = { convert, makeSb3, makeSprite3, serializeBlocks, md5, cleanSvg };
})(typeof window !== "undefined" ? window : globalThis);
