/* eslint-disable no-control-regex */
'use strict';

import TYPE from '../../types/mcdev.d.js';
import fs from 'fs-extra';

import path from 'node:path';
import prettier from 'prettier';
import beautyAmp from 'beauty-amp-core';
import { Util } from './util.js';
import updateNotifier from 'update-notifier';

// inform user when there is an update
const notifier = updateNotifier({
    pkg: Util.packageJsonMcdev,
    updateCheckInterval: 1000 * 3600 * 24, // once per day
});
// Notify using the built-in convenience method
notifier.notify();

/**
 * File extends fs-extra. It adds logger and util methods for file handling
 */
const File = {
    /**
     * copies a file from one path to another
     *
     * @param {string} from - full filepath including name of existing file
     * @param {string} to - full filepath including name where file should go
     * @returns {object} - results object
     */
    async copyFile(from, to) {
        try {
            await fs.copy(from, to);
            return { status: 'ok', file: from };
        } catch (ex) {
            // This can happen in some cases where referencing files deleted in Commit
            return ex.message.startsWith('ENOENT: no such file or directory')
                ? {
                      status: 'skipped',
                      statusMessage: 'deleted from repository',
                      file: from,
                  }
                : { status: 'failed', statusMessage: ex.message, file: from };
        }
    },
    /**
     * makes sure Windows accepts path names
     *
     * @param {string} path - filename or path
     * @returns {string} - corrected string
     */
    filterIllegalPathChars(path) {
        return (
            encodeURIComponent(path)
                .replaceAll(/[*]/g, '_STAR_')
                // convert space back
                .split('%20')
                .join(' ')
                // convert forward slash back as it's needed in dirs
                .split('%2F')
                .join('/')
                // convert backward slash back as it's needed in dirs
                .split('%5C')
                .join('\\')
                // convert opening-curly brackets back for templating
                .split('%7B')
                .join('{')
                // convert closing-curly brackets back for templating
                .split('%7D')
                .join('}')
                // convert brackets back for asset blocks
                .split('%5B')
                .join('[')
                // convert brackets back for asset blocks
                .split('%5D')
                .join(']')
                // convert @ back for users
                .split('%40')
                .join('@')
        );
    },

    /**
     * makes sure Windows accepts file names
     *
     * @param {string} filename - filename or path
     * @returns {string} - corrected string
     */
    filterIllegalFilenames(filename) {
        return (
            encodeURIComponent(filename)
                .replaceAll(/[*]/g, '_STAR_')
                // convert space back
                .split('%20')
                .join(' ')
                // convert opening-curly brackets back for templating
                .split('%7B')
                .join('{')
                // convert closing-curly brackets back for templating
                .split('%7D')
                .join('}')
                // convert brackets back for asset blocks
                .split('%5B')
                .join('[')
                // convert brackets back for asset blocks
                .split('%5D')
                .join(']')
                // convert @ back for users
                .split('%40')
                .join('@')
        );
    },

    /**
     * makes sure Windows accepts file names
     *
     * @param {string} filename - filename or path
     * @returns {string} - corrected string
     */
    reverseFilterIllegalFilenames(filename) {
        return decodeURIComponent(filename).split('_STAR_').join('*');
    },

    /**
     * Takes various types of path strings and formats into a platform specific path
     *
     * @param {string|string[]} denormalizedPath directory the file will be written to
     * @returns {string} Path strings
     */
    normalizePath: function (denormalizedPath) {
        /* eslint-disable unicorn/prefer-ternary */
        if (Array.isArray(denormalizedPath)) {
            // if the value is undefined set to empty string to allow parsing
            return path.join(...denormalizedPath.map((val) => val || ''));
        } else {
            // if directory is empty put . as otherwill will write to c://
            return path.join(denormalizedPath || '.');
        }
        /* eslint-enable unicorn/prefer-ternary */
    },
    /**
     * Saves json content to a file in the local file system. Will create the parent directory if it does not exist
     *
     * @param {string|string[]} directory directory the file will be written to
     * @param {string} filename name of the file without '.json' ending
     * @param {object} content filecontent
     * @returns {Promise} Promise
     */
    writeJSONToFile: async function (directory, filename, content) {
        directory = this.filterIllegalPathChars(this.normalizePath(directory));
        filename = this.filterIllegalFilenames(filename);
        await fs.ensureDir(directory);
        try {
            return fs.writeJSON(path.join(directory, filename + '.json'), content, { spaces: 4 });
        } catch (ex) {
            Util.logger.error('File.writeJSONToFile:: error | ' + ex.message);
        }
    },
    /**
     * Saves beautified files in the local file system. Will create the parent directory if it does not exist
     * ! Important: run 'await File.initPrettier()' in your MetadataType.retrieve() once before hitting this
     *
     * @param {string|string[]} directory directory the file will be written to
     * @param {string} filename name of the file without suffix
     * @param {string} filetype filetype ie. JSON or SSJS
     * @param {string} content filecontent
     * @param {TYPE.TemplateMap} [templateVariables] templating variables to be replaced in the metadata
     * @returns {Promise.<boolean>} Promise
     */
    writePrettyToFile: async function (directory, filename, filetype, content, templateVariables) {
        let formatted =
            filetype === 'amp'
                ? this._beautify_beautyAmp(content)
                : await this._beautify_prettier(directory, filename, filetype, content);
        if (templateVariables) {
            formatted = Util.replaceByObject(formatted, templateVariables);
        }
        return this.writeToFile(directory, filename, filetype, formatted);
    },
    /**
     * helper for {@link File.writePrettyToFile}, applying beautyAmp onto given stringified content
     *
     * @param {string} content filecontent
     * @returns {string} original string on error; formatted string on success
     */
    _beautify_beautyAmp: function (content) {
        // immutable at the moment:
        const ampscript = {
            capitalizeAndOrNot: true,
            capitalizeIfFor: true,
            capitalizeSet: true,
            capitalizeVar: true,
            maxParametersPerLine: 4,
        };
        // immutable at the moment:
        const editor = {
            insertSpaces: true,
            tabSize: 4,
        };
        // logs trough console only for the moment.
        const logs = {
            loggerOn: false, // <= disable logging
        };
        try {
            beautyAmp.setup(ampscript, editor, logs);
            return beautyAmp.beautify(content);
        } catch (ex) {
            Util.logger.debug('File._beautify_beautyAmp:: error | ' + ex.message);
            return content;
        }
    },
    /**
     * helper for {@link File.writePrettyToFile}, applying prettier onto given stringified content
     * ! Important: run 'await File.initPrettier()' in your MetadataType.retrieve() once before hitting this
     *
     * @param {string|string[]} directory directory the file will be written to
     * @param {string} filename name of the file without suffix
     * @param {string} filetype filetype ie. JSON or SSJS
     * @param {string} content filecontent
     * @returns {Promise.<string>} original string on error; formatted string on success
     */
    _beautify_prettier: async function (directory, filename, filetype, content) {
        let formatted = '';
        try {
            if (!FileFs.prettierConfig) {
                // either no prettier config in project directory or initPrettier was not run before this
                return content;
            } else if (content.includes('%%[') || content.includes('%%=')) {
                // in case we find AMPScript we need to abort beautifying as prettier
                // will throw an error falsely assuming bad syntax
                return this._beautify_beautyAmp(content);
            }
            // load the right prettier config relative to our file
            switch (filetype) {
                case 'htm':
                case 'html': {
                    FileFs.prettierConfig.parser = 'html';
                    break;
                }
                case 'ssjs':
                case 'js': {
                    FileFs.prettierConfig.parser = 'babel';
                    break;
                }
                case 'json': {
                    FileFs.prettierConfig.parser = 'json';
                    break;
                }
                case 'yaml':
                case 'yml': {
                    FileFs.prettierConfig.parser = 'yaml';
                    break;
                }
                case 'ts': {
                    FileFs.prettierConfig.parser = 'babel-ts';
                    break;
                }
                case 'css': {
                    FileFs.prettierConfig.parser = 'css';
                    break;
                }
                case 'less': {
                    FileFs.prettierConfig.parser = 'less';
                    break;
                }
                case 'sass':
                case 'scss': {
                    FileFs.prettierConfig.parser = 'scss';
                    break;
                }
                case 'md': {
                    FileFs.prettierConfig.parser = 'markdown';
                    break;
                }
                case 'sql': {
                    FileFs.prettierConfig.parser = 'sql';
                    FileFs.prettierConfig.plugins = ['prettier-plugin-sql'];
                    break;
                }
                default: {
                    FileFs.prettierConfig.parser = 'babel';
                }
            }
            formatted = await prettier.format(content, FileFs.prettierConfig);
        } catch (ex) {
            const warnMsg = `Potential Code issue found in ${this.normalizePath([
                ...directory,
                filename + '.' + filetype,
            ])}`;
            Util.logger.debug(warnMsg);
            if (Util.logger.level === 'debug') {
                // useful when running test cases in which we cannot see .error files
                Util.logger.debug(ex.message);
            }

            // save prettier errror into log file
            // Note: we have to filter color codes from prettier's error message before saving it to file
            this.writeToFile(
                directory,
                filename + '.error',
                'log',
                `Error Log\nParser: ${FileFs.prettierConfig.parser}\n${ex.message.replaceAll(
                    /[\u001B\u009B][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,

                    ''
                )}`
            );

            formatted = content;
        }

        return formatted;
    },
    /**
     * Saves text content to a file in the local file system. Will create the parent directory if it does not exist
     *
     * @param {string|string[]} directory directory the file will be written to
     * @param {string} filename name of the file without '.json' ending
     * @param {string} filetype filetype suffix
     * @param {string} content filecontent
     * @param {object} [encoding] added for certain file types (like images)
     * @returns {Promise.<boolean>} Promise
     */
    writeToFile: async function (directory, filename, filetype, content, encoding) {
        directory = this.filterIllegalPathChars(this.normalizePath(directory));
        await fs.ensureDir(directory);
        // filter characters that are illegal for file names in Windows
        filename = this.filterIllegalFilenames(filename);
        const filePath = path.join(directory, filename + '.' + filetype);
        try {
            if (await fs.pathExists(filePath)) {
                Util.logger.debug(`Overwriting: ${filePath}`);
            }
            await fs.writeFile(filePath, content, encoding);
            return true;
        } catch (ex) {
            Util.logger.error('File.writeToFile:: error | ' + ex.message);
            return false;
        }
    },

    /**
     * Saves json content to a file in the local file system. Will create the parent directory if it does not exist
     *
     * @param {string | string[]} directory directory where the file is stored
     * @param {string} filename name of the file without '.json' ending
     * @param {boolean} sync should execute sync (default is async)
     * @param {boolean} cleanPath should execute sync (default is true)
     * @returns {Promise.<object> | object | void} Promise or JSON object depending on if async or not; void on error
     */
    readJSONFile: function (directory, filename, sync, cleanPath) {
        try {
            if (cleanPath == null || cleanPath == true) {
                directory = this.filterIllegalPathChars(this.normalizePath(directory));
                filename = this.filterIllegalFilenames(filename);
            } else {
                directory = this.normalizePath(directory);
            }

            if (filename.endsWith('.json')) {
                filename = filename.slice(0, -5);
            }
            let json;
            try {
                json = sync
                    ? fs.readJsonSync(path.join(directory, filename + '.json'))
                    : fs.readJson(path.join(directory, filename + '.json'));
            } catch (ex) {
                // Note: this only works for sync, not async
                Util.logger.debug(ex.stack);
                throw new Error(`${ex.code}: ${ex.message}`);
            }
            return json;
        } catch (ex) {
            Util.logger.error('File.readJSONFile:: error | ' + ex.message);
        }
    },
    /**
     * reads file from local file system.
     *
     * @param {string | string[]} directory directory where the file is stored
     * @param {string} filename name of the file without '.json' ending
     * @param {string} filetype filetype suffix
     * @param {string} [encoding] read file with encoding (defaults to utf-8)
     * @returns {Promise.<string> | void} file contents; void on error
     */
    readFilteredFilename: function (directory, filename, filetype, encoding) {
        try {
            directory = this.filterIllegalPathChars(this.normalizePath(directory));
            filename = this.filterIllegalFilenames(filename);
            return fs.readFile(path.join(directory, filename + '.' + filetype), encoding || 'utf8');
        } catch (ex) {
            Util.logger.error('File.readFilteredFilename:: error | ' + ex.message);
        }
    },
    /**
     * reads directories to a specific depth returning an array
     * of file paths to be iterated over
     *
     * @example ['deploy/mcdev/bu1']
     * @param {string} directory directory to checkin
     * @param {number} depth how many levels to check (1 base)
     * @param {boolean} [includeStem] include the parent directory in the response
     * @param {number} [_stemLength] set recursively for subfolders. do not set manually!
     * @returns {Promise.<string[]>} array of fully defined file paths
     */
    readDirectories: async function (directory, depth, includeStem, _stemLength) {
        try {
            if (!_stemLength) {
                // only set this on first iteration
                _stemLength = directory.length;
            }
            const raw = await fs.readdir(directory, { withFileTypes: true });
            let children = [];
            for (const dirent of raw) {
                const direntPath = path.join(directory, dirent.name);
                if (
                    (await fs.pathExists(direntPath)) &&
                    (await fs.lstat(direntPath)).isDirectory() &&
                    depth > 0
                ) {
                    const nestedChildren = await this.readDirectories(
                        direntPath,
                        depth - 1,
                        includeStem,
                        _stemLength
                    );
                    children = children.concat(nestedChildren);
                }
            }
            if (children.length === 0) {
                // if not includeStem then remove base directory and leading slahes and backslashes
                return includeStem
                    ? [directory]
                    : [
                          directory
                              .slice(Math.max(0, _stemLength))
                              .replace(/^\\+/, '')
                              .replace(/^\/+/, ''),
                      ];
            } else {
                return children;
            }
        } catch (ex) {
            Util.logger.error('File.readDirectories:: error | ' + ex.message);
            Util.logger.debug(ex.stack);
        }
    },

    /**
     * reads directories to a specific depth returning an array
     * of file paths to be iterated over using sync api (required in constructors)
     * TODO - merge with readDirectories. so far the logic is really different
     *
     * @example ['deploy/mcdev/bu1']
     * @param {string} directory directory to checkin
     * @param {number} [depth] how many levels to check (1 base)
     * @param {boolean} [includeStem] include the parent directory in the response
     * @param {number} [_stemLength] set recursively for subfolders. do not set manually!
     * @returns {string[] | void} array of fully defined file paths; void on error
     */
    readDirectoriesSync: function (directory, depth, includeStem, _stemLength) {
        try {
            const children = [];

            if (!_stemLength) {
                // only set this on first iteration
                _stemLength = directory.length;
            }

            // add current directory
            if (includeStem) {
                children.push(directory);
            } else {
                // remove base directory and leading slahes and backslashes
                const currentPath = directory.slice(Math.max(0, _stemLength)).replace(path.sep, '');
                children.push(currentPath || '.');
            }
            // read all directories
            const raw = fs.readdirSync(directory, { withFileTypes: true });

            // loop through children of current directory (if not then this is skipped)
            for (const dirent of raw) {
                // if directory found and should get children then recursively call
                if (dirent.isDirectory() && depth > 0) {
                    const nestedChildren = this.readDirectoriesSync(
                        path.join(directory, dirent.name),
                        depth - 1,
                        includeStem,
                        _stemLength
                    );
                    children.push(...nestedChildren);
                }
            }
            return children;
        } catch (ex) {
            Util.logger.error('File.readDirectoriesSync:: error | ' + ex.message);
            Util.logger.debug(ex.stack);
        }
    },
    /**
     * helper that splits the config back into auth & config parts to save them separately
     *
     * @param {TYPE.Mcdevrc} properties central properties object
     * @returns {Promise.<void>} -
     */
    async saveConfigFile(properties) {
        // we want to save to save the full version here to allow us to upgrade configs properly in the future
        properties.version = Util.packageJsonMcdev.version;

        await this.writeJSONToFile('', Util.configFileName.split('.json')[0], properties);
        Util.logger.info(`✔️  ${Util.configFileName} and ${Util.authFileName} saved successfully`);
    },
    /**
     * Initalises Prettier formatting lib async.
     *
     * @param {string} [filetype] filetype ie. JSON or SSJS
     * @returns {Promise.<boolean>} success of config load
     */
    async initPrettier(filetype = 'html') {
        if (FileFs.prettierConfig === null || FileFs.prettierConfigFileType !== filetype) {
            // run this if no config was yet found or if the filetype previously used to initialize it differs (because it results in a potentially different config!)
            FileFs.prettierConfigFileType = filetype;
            try {
                // pass in project dir with fake index.html to avoid "no parser" error
                // by using process.cwd we are limiting ourselves to a config in the project root
                // note: overrides will be ignored unless they are for *.html if hand in an html file here. This method includes the overrides corresponding to the file we pass in
                FileFs.prettierConfig = await prettier.resolveConfig(
                    path.join(process.cwd(), 'index.' + filetype)
                );
                if (FileFs.prettierConfig === null) {
                    // set to false to avoid re-running this after an initial failure
                    throw new Error(
                        `No .prettierrc found in your project directory. Please run 'mcdev upgrade' to create it`
                    );
                }

                return true;
            } catch (ex) {
                FileFs.prettierConfig = false;
                Util.logger.error('Cannot apply auto-formatting to your code:' + ex.message);
                return false;
            }
        } else {
            return false;
        }
    },
};
const FileFs = { ...fs, ...File };
FileFs.prettierConfig = null;
FileFs.prettierConfigFileType = null;

export default FileFs;
