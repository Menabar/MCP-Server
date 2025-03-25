# MCP Server for Find Reference

## Configuring the MCP server

1. Add the server to AMP using ```http://localhost:3001``` and name it ```get-text-matches```.
2. Run the server using ```node server.js```.

## Current functionality

The MCP server supports two tools. Both tools will run recursively over all files in the given directory.

The ```get-text-matches``` tool returns a list of {file, line, column} where an exact text match is found.

The ```get-parse-tree``` tool returns the nodes of a parse tree in text form for a given string. Each node contains {file, node text, node type, start position, end position}. The grammar is based on JavaScript.

## Testing the MCP server

### Sample Directory
To get started, run this command in a new directory to make a sample client file:

<pre>mkdir client && cd client && touch temp.js && echo -e "let temp_x = 5;\n\ntemp_x = 7 + 4;\n\nconsole.log(temp_x);" > temp.js</pre>

### get-text-matches

Prompt the MCP server with the following command:

```use the get-text-match tool to find temp_x, specify the full path```

### get-parse-tree
Prompt the MCP server with the following command:

```use the get-parse-tree tool to find temp_x, specify the full path```

This allows follow-up prompts such as:

```what are the different node types of temp_x```

### Troubleshooting
If the MCP server selects the wrong tool, you can tell it to specifically not use a tool. For example:

```use the parse tree tool, not get text, to find temp_x, specify the full path```

It is not always necessary to tell it to specify the full path, but occasionally it will decide to use ```.``` as the directory instead of the full path, which the server needs.

The MCP server must trust the client to tell it what local directory to check. If desired, you can hard code the path on line 120 of server.js.

## Functionality for the future

1. Returning case-insensitive matches.
2. Allowing ignorable files/folders. For example, searching for "import" in a directory with ```node_modules``` goes over the token limit.
3. Making a prettier and more concise output for the parse tree.