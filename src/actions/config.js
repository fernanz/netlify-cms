import yaml from "js-yaml";
import { Map, List, fromJS } from "immutable";
import { trimStart, flow } from "lodash";
import { authenticateUser } from "Actions/auth";
import * as publishModes from "Constants/publishModes";

export const CONFIG_REQUEST = "CONFIG_REQUEST";
export const CONFIG_SUCCESS = "CONFIG_SUCCESS";
export const CONFIG_FAILURE = "CONFIG_FAILURE";
export const CONFIG_MERGE = "CONFIG_MERGE";

const defaults = {
  publish_mode: publishModes.SIMPLE,
};

export function applyDefaults(config) {
  return Map(defaults)
    .mergeDeep(config)
    .withMutations(map => {
      /**
       * Use media_folder as default public_folder.
       */
      const defaultPublicFolder = `/${trimStart(map.get('media_folder'), '/')}`;
      if (!map.get('public_folder')) {
        map.set('public_folder', defaultPublicFolder);
      }
    });
}

export function validateConfig(config) {
  if (!config.get('backend')) {
    throw new Error("Error in configuration file: A `backend` wasn't found. Check your config.yml file.");
  }
  if (!config.getIn(['backend', 'name'])) {
    throw new Error("Error in configuration file: A `backend.name` wasn't found. Check your config.yml file.");
  }
  if (typeof config.getIn(['backend', 'name']) !== 'string') {
    throw new Error("Error in configuration file: Your `backend.name` must be a string. Check your config.yml file.");
  }
  if (!config.get('media_folder')) {
    throw new Error("Error in configuration file: A `media_folder` wasn\'t found. Check your config.yml file.");
  }
  if (typeof config.get('media_folder') !== 'string') {
    throw new Error("Error in configuration file: Your `media_folder` must be a string. Check your config.yml file.");
  }
  if (!config.get('collections')) {
    throw new Error("Error in configuration file: A `collections` wasn\'t found. Check your config.yml file.");
  }
  const collections = config.get('collections');
  if (!List.isList(collections) || collections.isEmpty() || !collections.first()) {
    throw new Error("Error in configuration file: Your `collections` must be an array with at least one element. Check your config.yml file.");
  }
  return config;
}

function mergePreloadedConfig(preloadedConfig, loadedConfig) {
  const map = fromJS(loadedConfig) || Map();
  return preloadedConfig ? preloadedConfig.mergeDeep(map) : map;
}

function parseConfig(data) {
  const config = yaml.safeLoad(data);
  if (typeof CMS_ENV === "string" && config[CMS_ENV]) {
    Object.keys(config[CMS_ENV]).forEach((key) => {
      config[key] = config[CMS_ENV][key];
    });
  }
  return config;
}

export function configLoaded(config) {
  return {
    type: CONFIG_SUCCESS,
    payload: config,
  };
}

export function configLoading() {
  return {
    type: CONFIG_REQUEST,
  };
}

export function configFailed(err) {
  return {
    type: CONFIG_FAILURE,
    error: "Error loading config",
    payload: err,
  };
}

export function configDidLoad(config) {
  return (dispatch) => {
    dispatch(configLoaded(config));
  };
}

export function mergeConfig(config) {
  return { type: CONFIG_MERGE, payload: config };
}

export function loadConfig() {
  if (window.CMS_CONFIG) {
    return configDidLoad(fromJS(window.CMS_CONFIG));
  }
  return async (dispatch, getState) => {
    dispatch(configLoading());

    try {
      const preloadedConfig = getState().config;
      const response = await fetch('config.yml', { credentials: 'same-origin' })
      const requestSuccess = response.status === 200;

      if (!preloadedConfig && !requestSuccess) {
        throw new Error(`Failed to load config.yml (${ response.status })`);
      }

      const loadedConfig = parseConfig(requestSuccess ? await response.text() : '');

      /**
       * Merge any existing configuration so the result can be validated.
       */
      const mergedConfig = mergePreloadedConfig(preloadedConfig, loadedConfig)
      const config = flow(validateConfig, applyDefaults)(mergedConfig);

      dispatch(configDidLoad(config));
      dispatch(authenticateUser());
    }
    catch(err) {
      dispatch(configFailed(err));
      throw(err)
    }
  };
}
