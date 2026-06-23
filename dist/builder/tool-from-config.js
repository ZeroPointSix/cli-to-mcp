import { defineTool } from "../registry/tool-definition.js";
export function toolFromYamlDecl(name, decl, connector, sourceOverride = "yaml") {
    const args = Object.entries(decl.args ?? {}).map(([argName, a]) => ({
        name: argName,
        type: a.type,
        required: a.required,
        description: a.description,
        default: a.default,
        enumValues: a.enum,
        aliases: a.aliases,
        repeatable: a.repeatable,
    }));
    return defineTool({
        name,
        description: decl.description ?? `${decl.connector} ${decl.command.join(" ")}`,
        connectorName: decl.connector,
        binary: connector.binary,
        argvPrefix: connector.argv_prefix ? [...connector.argv_prefix] : undefined,
        command: [...decl.command],
        defaultArgs: decl.default_args ? [...decl.default_args] : undefined,
        args,
        output: decl.output,
        skillRefs: decl.skills ?? [],
        source: sourceOverride,
        enabled: decl.enabled,
    });
}
//# sourceMappingURL=tool-from-config.js.map