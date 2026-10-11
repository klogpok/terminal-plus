import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { loadUiLanguage } from './app/ui-language';

// The UI string set is fixed for the page's lifetime, so it is chosen before any component reads it.
loadUiLanguage();

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
