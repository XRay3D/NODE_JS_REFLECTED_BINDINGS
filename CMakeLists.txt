cmake_minimum_required(VERSION 3.16)

project(node_reflection LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 26)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_CURRENT_LIST_DIR}/bin)

if(CMAKE_CXX_COMPILER_ID STREQUAL "Clang")
  get_filename_component(CLANG_P2996_PATH ${CMAKE_CXX_COMPILER} PATH)
  get_filename_component(CLANG_P2996_PATH ${CLANG_P2996_PATH} PATH)
  message(==> ${CLANG_P2996_PATH})
  include_directories(${CLANG_P2996_PATH}/include/c++/v1)
  add_compile_options(-ftime-trace -fexpansion-statements -freflection-latest
                      -stdlib++-isystem ${CLANG_P2996_PATH}/include/c++/v1)
  add_link_options(
    -fuse-ld=lld -L${CLANG_P2996_PATH}/lib -lc++
    -lc++abi # "-Wl,-Map=${CMAKE_SOURCE_DIR}/${CMAKE_PROJECT_NAME}.map"
  )
endif()

set(CMAKE_SHARED_LIBRARY_PREFIX "")
set(CMAKE_SHARED_LIBRARY_SUFFIX ".node")

include_directories(/home/x-ray/.cache/node-gyp/22.16.0/include/node)

# raylib
set(RAYLIB_DIR /home/x-ray/build_qt/raylib-Clang_p2996-Release/raylib)
include_directories(${RAYLIB_DIR}/include)
link_directories(${RAYLIB_DIR}/ #[[lib64]])

add_library(node_reflection SHARED node_raylib.cpp Raylib_test.js)
target_link_libraries(node_reflection PUBLIC raylib)

#[[
include(GNUInstallDirs)
install(
  TARGETS node_reflection
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR})
]]
