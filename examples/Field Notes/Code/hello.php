<?php

function greet(string $name): string
{
    return "Hello, {$name}. Make yourself at home.";
}

echo greet('world') . PHP_EOL;
