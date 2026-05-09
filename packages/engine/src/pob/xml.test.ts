import { describe, expect, it } from "vitest";
import { parsePobXml } from "./xml.js";

describe("parsePobXml", () => {
  it("parses attributes with the @_ prefix", () => {
    const xml =
      '<PathOfBuilding><Build version="2_1" level="98" className="Sorceress" /></PathOfBuilding>';
    const r = parsePobXml(xml);
    const build = (r.PathOfBuilding as { Build: Record<string, unknown> }).Build;
    expect(build["@_version"]).toBe("2_1");
    expect(build["@_level"]).toBe("98");
    expect(build["@_className"]).toBe("Sorceress");
  });

  it("forces arrays for known multi-child tags even with one entry", () => {
    const xml = `
      <PathOfBuilding>
        <Skills>
          <SkillSet id="1">
            <Skill enabled="true">
              <Gem nameSpec="Fireball" level="20" />
            </Skill>
          </SkillSet>
        </Skills>
      </PathOfBuilding>
    `;
    const r = parsePobXml(xml);
    const skills = (r.PathOfBuilding as { Skills: { SkillSet: unknown[] } }).Skills;
    expect(Array.isArray(skills.SkillSet)).toBe(true);
    const skillSet = skills.SkillSet[0] as { Skill: unknown[] };
    expect(Array.isArray(skillSet.Skill)).toBe(true);
    const skill = skillSet.Skill[0] as { Gem: unknown[] };
    expect(Array.isArray(skill.Gem)).toBe(true);
  });

  it("handles text content inside elements", () => {
    const xml = `
      <PathOfBuilding>
        <Tree>
          <Spec>
            <URL>https://www.pathofexile.com/passive-skill-tree/AAAABgAA</URL>
          </Spec>
        </Tree>
      </PathOfBuilding>
    `;
    const r = parsePobXml(xml);
    const tree = (r.PathOfBuilding as { Tree: { Spec: Array<{ URL: string }> } }).Tree;
    expect(tree.Spec[0]?.URL).toBe(
      "https://www.pathofexile.com/passive-skill-tree/AAAABgAA",
    );
  });
});
