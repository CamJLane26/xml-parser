# XSD to ElementSchema Converter Tools

This directory contains tools for converting XSD (XML Schema Definition) files into TypeScript `ElementSchema` definitions used by the XML parser microservice.

## Table of Contents

- [Automated Conversion Approach](#automated-conversion-approach)
- [Manual Schema Construction Approach](#manual-schema-construction-approach)
- [Comparison and Decision Guide](#comparison-and-decision-guide)
- [Limitations and Known Issues](#limitations-and-known-issues)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [References](#references)

---

## Automated Conversion Approach

### Using the XSD Converter Tool

The automated converter tool parses XSD files and generates TypeScript `ElementSchema` definitions automatically.

#### Installation and Setup

The converter tool is already set up in this project. No additional installation is required beyond the project dependencies:

```bash
npm install
```

#### Basic Usage

Convert a single XSD file:

```bash
npm run convert-xsd -- --input path/to/schema.xsd --output src/config/generatedSchema.ts --root-element Toy
```

**Command-line options**:

- `-i, --input <path>`: Path to XSD file or directory containing XSD files (required)
- `-o, --output <path>`: Output TypeScript file path (required)
- `-r, --root-element <name>`: Name of root element to generate schema for (required)
- `-n, --namespace <ns>`: Target namespace (optional, for multi-namespace schemas)
- `-w, --watch`: Watch mode - regenerate on XSD file changes
- `-h, --help`: Show help message

#### Examples

**Simple schema conversion**:

```bash
npm run convert-xsd -- -i schemas/toy.xsd -o src/config/toySchema.ts -r toy
```

**Schema with namespace**:

```bash
npm run convert-xsd -- -i schemas/product.xsd -o src/config/productSchema.ts -r Product -n http://example.com/ns
```

**Watch mode** (regenerate on changes):

```bash
npm run convert-xsd -- -i schemas/toy.xsd -o src/config/toySchema.ts -r toy --watch
```

#### Handling Complex Schemas

**Multi-file schemas with imports**:

The converter automatically resolves `xs:import` and `xs:include` declarations. Simply point to the main XSD file:

```bash
npm run convert-xsd -- -i schemas/main.xsd -o src/config/mainSchema.ts -r RootElement
```

The tool will:
- Automatically find and parse imported/included XSD files
- Resolve type references across files
- Handle circular dependencies (with warnings)
- Merge schemas from multiple files

**Namespaces**:

For schemas with multiple namespaces, use the `--namespace` option to target a specific namespace:

```bash
npm run convert-xsd -- -i schema.xsd -o output.ts -r Element -n http://target-namespace.com
```

#### Output Format

The generated TypeScript file will look like this:

```typescript
import { ElementSchema } from '../types/schema';

/**
 * Generated ElementSchema from XSD
 * Root element: toy
 * Generated: 2024-01-16T10:30:00.000Z
 */
export const generatedSchema: ElementSchema = {
  rootElement: 'toy',
  fields: [
    { type: 'text', name: 'name' },
    { type: 'text', name: 'color' },
    {
      type: 'array',
      name: 'store',
      itemSchema: [
        { type: 'text', name: 'name' },
        { type: 'text', name: 'location' }
      ]
    }
  ]
};
```

#### Troubleshooting Common Issues

**Error: "Root element 'X' not found in XSD schema"**

- Verify the root element name matches exactly (case-sensitive)
- Check if the element is in a different namespace
- Use `--namespace` option if needed

**Error: "Failed to parse XSD file"**

- Ensure the XSD file is well-formed XML
- Check for syntax errors in the XSD
- Verify file encoding is UTF-8

**Warning: "Import/include file not found"**

- Ensure imported/included XSD files are in the correct relative path
- Check file permissions
- Verify `schemaLocation` attributes are correct

**Circular dependency warnings**

- The tool handles circular dependencies but may produce incomplete results
- Consider restructuring your XSD files to avoid circular references

### XSD Feature Support Matrix

#### Fully Supported

- ✅ `xs:element` - Simple and complex elements
- ✅ `xs:complexType` - Complex type definitions
- ✅ `xs:simpleType` - Simple type definitions (mapped to text)
- ✅ `xs:sequence` - Ordered sequences of elements
- ✅ `xs:choice` - Choice groups
- ✅ `xs:all` - All groups
- ✅ `xs:import` - Schema imports (with automatic resolution)
- ✅ `xs:include` - Schema includes (with automatic resolution)
- ✅ `maxOccurs` / `minOccurs` - Array detection and optional fields
- ✅ Nested complex types
- ✅ Type references (`type` attribute)

#### Partially Supported

- ⚠️ `xs:extension` - Base type extension (fields merged, but complex inheritance may need manual adjustment)
- ⚠️ `xs:restriction` - Type restriction (basic support, advanced restrictions may be simplified)
- ⚠️ Namespaces - Basic support, complex namespace handling may require manual intervention
- ⚠️ `xs:union` - Union types (mapped to text, specific union handling not supported)
- ⚠️ `xs:list` - List types (mapped to text array)

#### Unsupported Features

- ❌ `xs:attribute` - Attributes are not extracted (only element content)
- ❌ `xs:substitutionGroup` - Substitution groups
- ❌ `xs:any` / `xs:anyAttribute` - Wildcard elements/attributes
- ❌ `xs:key` / `xs:keyref` - Key constraints
- ❌ `xs:unique` - Uniqueness constraints
- ❌ `xs:annotation` - Documentation/annotations (ignored)
- ❌ Mixed content (`mixed="true"`) - Text and elements mixed (text content extracted, but structure may be simplified)
- ❌ Recursive types - Circular type references may cause issues

**Workarounds**:

- For attributes: Manually add them as text fields if needed
- For substitution groups: Manually create the appropriate schema structure
- For mixed content: Manually adjust the generated schema to handle text content

---

## Manual Schema Construction Approach

### Alternative: Using XSD as a Reference Guide

If automated conversion doesn't meet your needs, you can manually construct `ElementSchema` definitions using XSD files as a reference. This approach gives you full control and helps you understand the schema structure.

### XSD Analysis Workflow

#### 1. How to Read and Understand XSD Files

XSD files define the structure, data types, and constraints for XML documents. Key concepts:

- **Elements** (`xs:element`): Define XML elements and their content
- **Complex Types** (`xs:complexType`): Define elements that contain other elements or attributes
- **Simple Types** (`xs:simpleType`): Define text-only elements with constraints
- **Sequences** (`xs:sequence`): Elements must appear in a specific order
- **Choices** (`xs:choice`): One of several elements can appear
- **Occurrence** (`minOccurs`, `maxOccurs`): How many times an element can appear

#### 2. Identifying Root Elements

The root element is typically:
- Defined at the top level of the schema (not inside a complex type)
- Referenced in your XML files as the outermost element
- May be explicitly marked or the first element definition

Example XSD:

```xml
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="toy" type="ToyType"/>
  <xs:complexType name="ToyType">
    <xs:sequence>
      <xs:element name="name" type="xs:string"/>
      <xs:element name="color" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>
```

Here, `toy` is the root element.

#### 3. Mapping XSD Structures to ElementSchema Types

**Text Fields**:

XSD:
```xml
<xs:element name="name" type="xs:string"/>
```

ElementSchema:
```typescript
{ type: 'text', name: 'name' }
```

**Object Fields**:

XSD:
```xml
<xs:complexType name="StoreType">
  <xs:sequence>
    <xs:element name="name" type="xs:string"/>
    <xs:element name="location" type="xs:string"/>
  </xs:sequence>
</xs:complexType>
<xs:element name="store" type="StoreType"/>
```

ElementSchema:
```typescript
{
  type: 'object',
  name: 'store',
  fields: [
    { type: 'text', name: 'name' },
    { type: 'text', name: 'location' }
  ]
}
```

**Array Fields**:

XSD:
```xml
<xs:element name="store" type="StoreType" maxOccurs="unbounded"/>
```

ElementSchema:
```typescript
{
  type: 'array',
  name: 'store',
  itemSchema: [
    { type: 'text', name: 'name' },
    { type: 'text', name: 'location' }
  ]
}
```

**Nested Structures**:

XSD:
```xml
<xs:complexType name="ToyType">
  <xs:sequence>
    <xs:element name="name" type="xs:string"/>
    <xs:element name="category">
      <xs:complexType>
        <xs:sequence>
          <xs:element name="type" type="xs:string"/>
          <xs:element name="subcategory">
            <xs:complexType>
              <xs:sequence>
                <xs:element name="name" type="xs:string"/>
              </xs:sequence>
            </xs:complexType>
          </xs:element>
        </xs:sequence>
      </xs:complexType>
    </xs:element>
  </xs:sequence>
</xs:complexType>
```

ElementSchema:
```typescript
{
  type: 'object',
  name: 'category',
  fields: [
    { type: 'text', name: 'type' },
    {
      type: 'object',
      name: 'subcategory',
      fields: [
        { type: 'text', name: 'name' }
      ]
    }
  ]
}
```

**Optional Fields**:

XSD:
```xml
<xs:element name="description" type="xs:string" minOccurs="0"/>
```

ElementSchema:
```typescript
{ type: 'text', name: 'description' }
// Note: Optional fields may be undefined in parsed results
```

#### 4. Handling Complex Types Manually

When encountering `xs:complexType`:

1. Identify all child elements (in sequence, choice, or all groups)
2. For each child element:
   - Determine if it's text, object, or array
   - If it references another complex type, recursively map that type
   - If it has `maxOccurs > 1`, it's an array
3. Build the nested structure

#### 5. Dealing with Imports/Includes Manually

When XSD files use `xs:import` or `xs:include`:

1. Locate the imported/included XSD files
2. Parse each file to understand its type definitions
3. Map type references to the actual definitions
4. Build a unified schema that includes types from all files

### Manual Mapping Guide

#### Quick Reference

| XSD Construct | ElementSchema Mapping |
|--------------|----------------------|
| `xs:element` with `xs:string` type | `{ type: 'text', name: 'elementName' }` |
| `xs:element` with `xs:complexType` | `{ type: 'object', name: 'elementName', fields: [...] }` |
| `xs:element` with `maxOccurs="unbounded"` | `{ type: 'array', name: 'elementName', itemSchema: [...] }` |
| `xs:sequence` | Process all child elements in order |
| `xs:choice` | Process all child elements (parser handles choice) |
| `xs:all` | Process all child elements |
| `xs:extension` | Merge base type fields with extension fields |
| `minOccurs="0"` | Field may be undefined (no special handling needed) |

### Tools for XSD Analysis

#### XML/XSD Editors

- **Oxygen XML Editor**: Professional XML/XSD editor with visual schema designer
- **XMLSpy**: Advanced XML/XSD development environment
- **Altova XMLSpy**: Commercial XML editor with XSD support

#### VS Code Extensions

- **XML Tools**: Basic XML editing and validation
- **XML**: Red Hat's XML language support
- **XSD Viewer**: Visualize XSD structure

#### Online Tools

- **XML Schema Validator**: Validate XSD files online
- **FreeFormatter XSD Validator**: Validate and view XSD structure
- **Liquid Technologies XSD Viewer**: Visual XSD browser

#### Command-line Tools

- **xmllint**: Validate XSD files (part of libxml2)
  ```bash
  xmllint --schema schema.xsd file.xml
  ```
- **xsd2inst**: Generate XML instance from XSD (part of some XML toolkits)

#### Browser-based Tools

- **XSD Diagram Generator**: Generate visual diagrams from XSD
- **XML Schema Viewer**: Web-based XSD visualization

### Step-by-Step Example

Let's walk through manually constructing an ElementSchema from an XSD:

**Step 1: Examine the XSD**

```xml
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="toy">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="name" type="xs:string"/>
        <xs:element name="color" type="xs:string"/>
        <xs:element name="store" maxOccurs="unbounded">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="name" type="xs:string"/>
              <xs:element name="location" type="xs:string"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
```

**Step 2: Identify the Root Element**

- Root element: `toy`

**Step 3: Map Each Field**

1. `name` → Simple string → `{ type: 'text', name: 'name' }`
2. `color` → Simple string → `{ type: 'text', name: 'color' }`
3. `store` → Has `maxOccurs="unbounded"` → Array
   - Item schema: complex type with `name` and `location`
   - `{ type: 'array', name: 'store', itemSchema: [...] }`

**Step 4: Build the Complete Schema**

```typescript
import { ElementSchema } from '../types/schema';

export const toySchema: ElementSchema = {
  rootElement: 'toy',
  fields: [
    { type: 'text', name: 'name' },
    { type: 'text', name: 'color' },
    {
      type: 'array',
      name: 'store',
      itemSchema: [
        { type: 'text', name: 'name' },
        { type: 'text', name: 'location' }
      ]
    }
  ]
};
```

**Step 5: Test the Schema**

Create a test XML file and verify the parser extracts data correctly.

### Best Practices for Manual Construction

1. **Start with the root element and work down**
   - Identify the root element first
   - Then map its direct children
   - Recursively handle nested structures

2. **Handle one complex type at a time**
   - Don't try to map everything at once
   - Focus on one complex type, complete it, then move to the next

3. **Test incrementally as you build**
   - Create a minimal schema first
   - Test with sample XML
   - Add fields incrementally
   - Verify each addition works

4. **Document decisions and edge cases**
   - Note why you made certain mapping choices
   - Document any simplifications or assumptions
   - Keep notes on complex XSD features you encountered

5. **Keep XSD files as reference alongside generated schemas**
   - Store XSD files in a `schemas/` directory
   - Reference them in comments in your TypeScript schema files
   - Update both when schema changes

6. **Use consistent naming**
   - Match element names exactly (case-sensitive)
   - Use clear, descriptive names for schema variables

### When to Use Each Approach

#### Use Automated Conversion When:

- ✅ You have large, complex schemas with many elements
- ✅ XSD files change frequently and you need to regenerate schemas
- ✅ The mapping is straightforward (standard XSD constructs)
- ✅ You want to save time on initial schema creation
- ✅ You're working with well-structured, standard XSD files

#### Use Manual Construction When:

- ✅ You need fine-grained control over the schema structure
- ✅ XSD has complex business logic that needs custom handling
- ✅ You want to learn and understand the schema structure deeply
- ✅ Automated conversion produces incorrect or incomplete results
- ✅ You need to add custom transformations or simplifications
- ✅ The schema is relatively simple and manual work is manageable

#### Hybrid Approach:

You can also use a hybrid approach:

1. Use automated conversion to generate an initial schema
2. Manually review and refine the generated schema
3. Add custom handling for edge cases
4. Document any manual changes

This gives you the speed of automation with the control of manual construction.

---

## Comparison and Decision Guide

### Automated vs Manual Comparison

| Aspect | Automated | Manual |
|--------|-----------|--------|
| **Speed** | ⚡ Fast (seconds) | 🐌 Slow (minutes to hours) |
| **Accuracy** | ✅ Good for standard XSD | ✅ Perfect (you control it) |
| **Complex XSD Features** | ⚠️ May need manual adjustment | ✅ Full control |
| **Learning Curve** | 📚 Low (just run command) | 📚 High (need XSD knowledge) |
| **Maintenance** | 🔄 Easy (regenerate) | 🔄 Manual updates needed |
| **Customization** | ⚠️ Limited | ✅ Full control |
| **Error Handling** | ⚠️ May miss edge cases | ✅ You handle all cases |
| **Documentation** | ⚠️ Generated comments | ✅ Your own documentation |

### Performance Considerations

- **Automated**: Fast for initial generation, but may require manual refinement
- **Manual**: Slower initially, but no regeneration needed unless XSD changes significantly

### Maintenance Overhead

- **Automated**: Low - just regenerate when XSD changes
- **Manual**: Medium - need to update TypeScript when XSD changes

### Flexibility and Customization

- **Automated**: Limited to what the converter supports
- **Manual**: Complete freedom to structure the schema as needed

### Learning Curve

- **Automated**: Minimal - just learn the command-line tool
- **Manual**: Higher - need to understand XSD structure and ElementSchema format

### Decision Matrix

**Choose Automated Conversion if:**
- Your XSD is well-structured and uses standard constructs
- You need to generate schemas quickly
- XSD files change frequently
- You're okay with potential manual refinement

**Choose Manual Construction if:**
- You need precise control over the schema
- XSD has complex features not well-supported by the converter
- You want to deeply understand the schema structure
- The schema is relatively simple

**Choose Hybrid Approach if:**
- You want speed but also need customization
- XSD is mostly standard but has some complex parts
- You want to use automation as a starting point

---

## Limitations and Known Issues

### General Limitations

1. **Attributes Not Extracted**: XSD attributes are not included in ElementSchema. Only element content is extracted.

2. **Simplified Type System**: ElementSchema uses a simplified type system (text/object/array). Complex XSD type features may be simplified.

3. **No Validation**: The generated schemas don't enforce XSD constraints like:
   - Data type validation (string length, patterns, etc.)
   - Required vs optional fields (all fields may be undefined if missing)
   - Enumeration constraints

4. **Namespace Handling**: Basic namespace support. Complex namespace scenarios may require manual intervention.

### Known Issues

1. **Circular Type References**: May cause issues or incomplete schemas. The converter detects and warns about circular dependencies.

2. **Substitution Groups**: Not supported. You'll need to manually create the appropriate schema structure.

3. **Mixed Content**: Text and elements mixed together may not map perfectly. Text content is extracted but structure may be simplified.

4. **Complex Inheritance**: Deep inheritance chains with extensions/restrictions may need manual adjustment.

5. **Any/AnyAttribute**: Wildcard elements are skipped.

### Workarounds

- For missing features, manually adjust the generated schema
- Use manual construction for complex parts, automated for simple parts
- Keep XSD files as reference for validation outside the parser

---

## Troubleshooting

### Common Problems and Solutions

**Problem**: Converter can't find imported XSD files

**Solution**: 
- Ensure imported XSD files are in the correct relative path
- Check `schemaLocation` attributes in import/include declarations
- Use absolute paths if relative paths don't work

**Problem**: Generated schema doesn't match expected structure

**Solution**:
- Review the XSD file to understand the actual structure
- Check if complex XSD features are being simplified
- Manually adjust the generated schema
- Consider using manual construction for complex parts

**Problem**: Root element not found

**Solution**:
- Verify the element name matches exactly (case-sensitive)
- Check if the element is in a different namespace
- Use `--namespace` option if needed
- List available elements by checking the XSD file

**Problem**: Array detection not working

**Solution**:
- Verify `maxOccurs` attribute is set correctly in XSD
- Check if the element is inside a sequence/choice that affects occurrence
- Manually mark as array if needed

**Problem**: Nested structures not mapping correctly

**Solution**:
- Verify complex type references are correct
- Check for namespace issues
- Manually construct nested structures if needed

---

## FAQ

**Q: Can I use both automated and manual approaches?**

A: Yes! Use automated conversion as a starting point, then manually refine the generated schema.

**Q: What if my XSD uses features not supported by the converter?**

A: You'll need to manually construct those parts of the schema. The converter will skip unsupported features.

**Q: How do I handle XSD files with multiple namespaces?**

A: Use the `--namespace` option to target a specific namespace, or manually construct schemas for each namespace.

**Q: Can I validate XML against the XSD using this tool?**

A: No, this tool only generates extraction schemas. Use XSD validators (like `xmllint`) for XML validation.

**Q: What happens if the XSD changes?**

A: With automated conversion, just regenerate. With manual construction, you'll need to update the TypeScript schema manually.

**Q: Can I customize the generated code format?**

A: The code generator uses a template. You can modify `generateTypeScriptCode` in `xsdConverter.ts` to customize the output format.

**Q: How do I handle optional fields?**

A: Optional fields (minOccurs="0") may be undefined in parsed results. The parser handles this automatically - fields not present in XML will be undefined.

**Q: What about XSD annotations/documentation?**

A: Annotations are ignored. Add your own documentation comments in the generated TypeScript files.

---

## References

### XSD Documentation

- [W3C XML Schema Primer](https://www.w3.org/TR/xmlschema-0/)
- [W3C XML Schema Structures](https://www.w3.org/TR/xmlschema-1/)
- [W3C XML Schema Datatypes](https://www.w3.org/TR/xmlschema-2/)

### Tools and Resources

- [XML Schema Validator](https://www.liquid-technologies.com/online-xsd-validator)
- [XSD Viewer](https://www.liquid-technologies.com/online-xsd-viewer)
- [XML Tools for VS Code](https://marketplace.visualstudio.com/items?itemName=DotJoshJohnson.xml)

### Related Documentation

- [ElementSchema Type Definition](../types/schema.ts)
- [XML Parser Documentation](../parsers/xmlParser.ts)
- [Main Project README](../../README.md)

---

## Contributing

To extend the converter tool:

1. **Add XSD Feature Support**: Modify `xsdParser.ts` to extract new XSD constructs
2. **Improve Mapping Logic**: Update `xsdToElementSchema.ts` to handle new mappings
3. **Enhance Code Generation**: Modify `generateTypeScriptCode` in `xsdConverter.ts` for different output formats
4. **Add Tests**: Create test cases in `tests/tools/` directory

For questions or issues, please refer to the main project documentation or create an issue in the project repository.
