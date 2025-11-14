import { Routes } from '@angular/router';
import { Calculadora } from './calculadora/calculadora';

export const routes: Routes = [
    { path: 'calculadora', component:Calculadora},
    { path:'**', redirectTo:'calculadora', pathMatch:'full' }
];
