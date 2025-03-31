import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import fs from 'fs';
import path from 'path';
import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';

// Function to search directory for a text match
function searchDirectory(dir, searchText) {
    // example: matches = [{'file': 'temp', 'line': 4, 'column': 5}];
    const matches = [];

    // Recursive function to traverse directories and read files
    function searchFile(filePath) {
        const stats = fs.statSync(filePath);
        
        // If it's a directory, traverse it
        if (stats.isDirectory()) {
            const files = fs.readdirSync(filePath);
            files.forEach(file => {
                searchFile(path.join(filePath, file));
            });
        }
        // If it's a file, check it for matches
        else if (stats.isFile()) {

            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');

            lines.forEach((line, lineNumber) => {
                let columnNumber = line.indexOf(searchText);
                while (columnNumber !== -1) {
                    matches.push({
                        file: filePath,
                        line: lineNumber + 1,
                        column: columnNumber + 1
                    });
                    columnNumber = line.indexOf(searchText, columnNumber + 1);
                }
            });
        }
    }

    searchFile(dir);
    return matches;
}

// Initialize the Tree-sitter parser
const parser = new Parser();
parser.setLanguage(JavaScript);

// Set up MCP server
const server = new McpServer({
  name: "get-reference-server",
  version: "1.0.0"
});

server.tool(
    "get-text-matches",
    "Find all matching references to a string in the same directory. Returns all substring text matches.",
    {
      text: z.string(),
      directory: z.string(),
    },
    async ({ text, directory }) => {

      // hard code the directory in question below
      // directory = '/YOUR/ABSOLUTE/PATH/HERE';
      
      const result = searchDirectory(directory, text);
  
    return {
        content: result.map((match) => ({
          type: "text",
          text: `File: ${match.file.slice(directory.length)}, Line: ${match.line}, Column: ${match.column}`,
        }))
      };
    },
  );

  server.tool(
    "get-parse-tree",
    "Return rich metadata about javascript files. Get additional information on variable scope, node tyoe, variable type, and more.",
    {
      text: z.string(),
      directory: z.string(),
    },
    async ({ text, directory }) => {
      // hard code the directory in question below
      // directory = '/YOUR/ABSOLUTE/PATH/HERE';

      // Enhanced search tree function with rich metadata
      function searchTreeEnhanced(directoryPath, targetString) {
        const results = [];
        
        // Read all files in the directory
        const files = fs.readdirSync(directoryPath);
        
        files.forEach((file) => {
          const fullPath = path.join(directoryPath, file);
          
          if (fs.lstatSync(fullPath).isFile() && file.endsWith('.js')) {
            const fileContent = fs.readFileSync(fullPath, 'utf-8');
            const tree = parser.parse(fileContent);
            
            // Recursive function to find nodes containing the target text
            function traverseNode(node) {
              if (node.text.includes(targetString)) {
                // Get parent node information
                const parentInfo = node.parent ? {
                  type: node.parent.type,
                  text: node.parent.text.length > 50 ? node.parent.text.substring(0, 50) + '...' : node.parent.text
                } : null;
                
                // Get scope information
                const scopeTypes = ['function_declaration', 'method_definition', 'arrow_function', 'class_declaration', 'block'];
                let scope = null;
                let current = node.parent;
                while (current) {
                  if (scopeTypes.includes(current.type)) {
                    scope = {
                      type: current.type,
                      id: current.id
                    };
                    break;
                  }
                  current = current.parent;
                }
                
                // Get sibling information
                const siblings = [];
                if (node.parent) {
                  for (let i = 0; i < node.parent.childCount; i++) {
                    const sibling = node.parent.child(i);
                    if (sibling && sibling.id !== node.id) {
                      siblings.push({
                        type: sibling.type,
                        text: sibling.text.length > 20 ? sibling.text.substring(0, 20) + '...' : sibling.text
                      });
                    }
                  }
                }
                
                // Get context (surrounding lines)
                const lines = fileContent.split('\n');
                const lineIndex = node.startPosition.row;
                const contextLines = {
                  before: lineIndex > 0 ? lines[lineIndex - 1] : '',
                  line: lines[lineIndex],
                  after: lineIndex < lines.length - 1 ? lines[lineIndex + 1] : ''
                };
                
                results.push({
                  file: fullPath,
                  nodeText: node.text,
                  nodeType: node.type,
                  startPosition: node.startPosition,
                  endPosition: node.endPosition,
                  parentInfo,
                  scope,
                  siblings: siblings.length > 0 ? siblings : null,
                  childCount: node.childCount,
                  namedChildCount: node.namedChildCount,
                  isNamed: node.isNamed,
                  context: contextLines
                });
              }
              
              // Traverse child nodes
              if (node.namedChildren) {
                node.namedChildren.forEach(traverseNode);
              }
            }
            
            traverseNode(tree.rootNode);
          }
        });
        
        return results;
      }
      
      const result = searchTreeEnhanced(directory, text);
  
      return {
        content: result.map((match) => ({
          type: "text",
          text: `File: ${match.file.slice(directory.length)}, Node Type: ${match.nodeType}, Line: ${match.startPosition.row + 1}, Column: ${match.startPosition.column + 1}\n` +
                `Node Text: "${match.nodeText.length > 100 ? match.nodeText.substring(0, 100) + '...' : match.nodeText}"\n` +
                `Parent: ${match.parentInfo ? match.parentInfo.type : 'none'}, Scope: ${match.scope ? match.scope.type : 'global'}\n` +
                `Siblings: ${match.siblings ? match.siblings.length : 0}, Children: ${match.childCount}, Named Children: ${match.namedChildCount}\n` +
                `Start: {row: ${match.startPosition.row}, column: ${match.startPosition.column}}, End: {row: ${match.endPosition.row}, column: ${match.endPosition.column}}\n` +
                `Context:\n  ${match.context.before}\n> ${match.context.line}\n  ${match.context.after}`
        }))
      };
    },
  );

// Set up express app
const app = express();

// Store the transport globally (for simplicity, assuming only one connection at a time)
let globalTransport = null;

// Define SSE endpoint
app.get("/sse", async (req, res) => {
  globalTransport = new SSEServerTransport("/messages", res);
  await server.connect(globalTransport);
});

// Define POST endpoint to handle messages
app.post("/messages", async (req, res) => {
  if (globalTransport) {
    await globalTransport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No active SSE connection.");
  }
});

// Start the server
app.listen(3001, () => {
  console.log("Server is running on http://localhost:3001");
});
