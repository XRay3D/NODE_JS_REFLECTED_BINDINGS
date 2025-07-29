#include <cstdlib>
#include <meta>
#include <node.h>
#include <print>
#include <ranges>

namespace meta = std::meta;
namespace ranges = std::ranges;
namespace views = std::views;

using namespace std::literals;

namespace RL {
#include <raylib.h>
}

using namespace v8;

#define PRINTLN(...) // std:: println(__VA_ARGS__)
#define PRINT(...)   // std:: print(__VA_ARGS__)

template <typename T> concept IsRawString = (std::is_same_v<std::remove_cvref_t<T>, const char*> || std::is_same_v<std::remove_cvref_t<T>, char*>);
template <typename T> concept IsIntegral = std::is_integral_v<T>;
template <typename T> concept IsFloatingPoint = std::is_floating_point_v<T>;
template <typename T> concept IsAggregate = std::is_aggregate_v<T>;
template <typename T> concept IsBool = std::is_same_v<T, bool>;
template <typename T> concept IsArray = std::is_array_v<T>;
constexpr auto UCTX = meta::access_context::unchecked();

std::vector<std::string> stringChahe{};

struct fromJs {
    Isolate* const isolate;
    const Local<Context> ctx{isolate->GetCurrentContext()};
    Local<Value> value_;

    fromJs& operator()(Local<Value>&& value) {
        value_ = std::move(value);
        return *this;
    }

    template <IsIntegral Cast>
        requires std::is_signed_v<Cast>
    operator Cast() { return value_->IntegerValue(ctx).FromJust(); }

    template <IsIntegral Cast>
        requires(!std::is_signed_v<Cast>)
    operator Cast() { return value_->Uint32Value(ctx).FromJust(); }

    template <IsFloatingPoint Cast>
    operator Cast() { return value_->NumberValue(ctx).FromJust(); }

    template <IsRawString Cast>
    operator Cast() {
        return stringChahe.emplace_back(*String::Utf8Value(isolate, value_->ToString(ctx).ToLocalChecked())).c_str();
    }

    template <IsAggregate Cast>
    operator Cast() {
        Cast cast;
        if(value_->IsObject()) {
            PRINTLN("{}", meta::display_string_of(^^Cast));
            constexpr auto FIELDS = std::define_static_array(meta::nonstatic_data_members_of(^^Cast, UCTX));
            Local<Object> obj = value_->ToObject(ctx).ToLocalChecked();
            Local<Array> props = obj->GetOwnPropertyNames(ctx).ToLocalChecked();
            std::unordered_map<std::string, Local<Value>> values;
            for(auto i: views::iota(0u, props->Length())) {
                Local<Value> localKey = props->Get(ctx, i).ToLocalChecked();
                Local<Value> localVal = obj->Get(ctx, localKey).ToLocalChecked();
                std::string key = *String::Utf8Value(isolate, localKey);
                std::string val = *String::Utf8Value(isolate, localVal);
                values[key] = localVal;
                PRINTLN("{} : {} ", key, val);
            }
            template for(constexpr meta::info FIELD: FIELDS) {
                if(auto it = values.find(meta::display_string_of(FIELD).data()); it != values.end()) {
                    cast.[:FIELD:] = this->operator()(std::move(it->second));
                }
            }
        } else {
            auto var = value_->IntegerValue(ctx).FromJust();
            std::memcpy(&cast, &var, sizeof(cast));
        }
        return cast;
    }

    template <typename Cast>
    operator Cast() {
        std::println("unsupported {}", meta::display_string_of(^^Cast));
        return {};
    }
};

struct toJs {
    Isolate* const isolate;

    template <typename Cast>
    auto operator()(const Cast& cast) const { return to<Cast>(cast); }

    template <IsBool Cast>
    auto to(const Cast& cast) const { return Boolean::New(isolate, cast); }

    template <IsIntegral Cast>
        requires(!IsBool<Cast> && std::is_signed_v<Cast>)
    auto to(const Cast& cast) const { return Integer::New(isolate, cast); }

    template <IsIntegral Cast>
        requires(!IsBool<Cast> && !std::is_signed_v<Cast>)
    auto to(const Cast& cast) const { return Integer::NewFromUnsigned(isolate, cast); }

    template <IsFloatingPoint Cast>
    auto to(const Cast& cast) const { return Number::New(isolate, cast); }

    template <IsRawString Cast>
    auto to(const Cast& cast) const {
        return String::NewFromUtf8(isolate, cast, NewStringType::kNormal, strlen(cast)).ToLocalChecked();
    }

    template <IsAggregate Cast>
    auto to(const Cast& cast) const {
        constexpr auto FIELDS = std::define_static_array(meta::nonstatic_data_members_of(^^Cast, UCTX));
        std::vector<Local<Name>> names;
        std::vector<Local<Value>> values;
        template for(constexpr meta::info FIELD: FIELDS) {
            names.emplace_back(this->operator()(meta::display_string_of(FIELD).data()));
            values.emplace_back(this->operator()(cast.[:FIELD:]));
        }
        return Object::New(isolate, Null(isolate), names.data(), values.data(), names.size());
    }

    template <typename Cast>
    auto to(const Cast& cast) const {
        std::println("unsupported {}", meta::display_string_of(^^Cast));
        return Null(isolate);
    }
};

template <meta::info FUNCTION>
void call_function(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    toJs toJs{isolate};

    PRINTLN("{} {}()",
        meta::display_string_of(meta::return_type_of(FUNCTION)),
        meta::display_string_of(FUNCTION));

    if constexpr(meta::return_type_of(FUNCTION) == ^^void) {
        [:FUNCTION:]();
    } else {
        args.GetReturnValue().Set(toJs([:FUNCTION:]()));
    }
}

template <meta::info FUNCTION>
void call_function_with_args(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    toJs toJs{isolate};
    fromJs fromJs{isolate};
    constexpr auto FUNCTION_ARGS = std::define_static_array(meta::parameters_of(FUNCTION));
    constexpr auto TYPES = std::define_static_array(views::transform(FUNCTION_ARGS,
        [](meta::info info) { return meta::type_of(info); }));

    using tuple = typename[:meta::substitute(^^std::tuple, TYPES):];
    tuple values{};

    PRINT("{} {}(",
        meta::display_string_of(meta::return_type_of(FUNCTION)),
        meta::display_string_of(FUNCTION));

    // init empty strings
    template for(constexpr size_t Is: std::define_static_array(views::iota(0u, TYPES.size()))) {
        using Type = std::remove_cvref_t<decltype(std::get<Is>(values))>;
        if constexpr(IsRawString<Type>)
            std::get<Is>(values) = "";
        if(Is < args.Length()) std::get<Is>(values) = fromJs(args[Is]);
        if constexpr(std::formattable<Type, char>)
            PRINT("{}{}", std::get<Is>(values), &", "[Is == args.Length() - 1]);
        else
            PRINT("@{}", &", "[Is == args.Length() - 1]);
    }
    PRINTLN(")");

    if constexpr(meta::return_type_of(FUNCTION) == ^^void)
        std::apply([:FUNCTION:], values);
    else
        args.GetReturnValue().Set(toJs(std::apply([:FUNCTION:], values)));

    stringChahe.clear();
}

void Method(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    args.GetReturnValue().Set(String::NewFromUtf8(isolate, "world", NewStringType::kNormal).ToLocalChecked());
}

void Initialize(Local<Object> exports) {
    NODE_SET_METHOD(exports, "method", Method);
    Isolate* isolate = exports->GetIsolate();

    constexpr auto RL_MEMBERS = std::define_static_array(meta::members_of(^^RL, UCTX));

#if 0 // all TODO arrays
    constexpr auto FUNCTIONS = std::define_static_array(
        views::filter(RL_MEMBERS, [](meta::info info) {
            return meta::is_function(info);
        }));
#else
    constexpr auto FUNCTIONS = std::define_static_array(
        views::filter(RL_MEMBERS, [](meta::info info) {
            static constexpr std::array names{
                "InitWindow"sv,
                "SetTargetFPS"sv,
                "WindowShouldClose"sv,
                "BeginDrawing"sv,
                "ClearBackground"sv,
                "DrawRectangleV"sv,
                "DrawRectangle"sv,
                "DrawRectangleV"sv,
                "EndDrawing"sv,
                "GetRandomValue"sv,
                "GetFrameTime"sv,
                "GetTime"sv,
                "GetMousePosition"sv,
                "GetMouseDelta"sv,
                "IsMouseButtonPressed"sv,
                "IsMouseButtonDown"sv,
                "IsMouseButtonReleased"sv,
                "IsMouseButtonUp"sv,
            };
            return meta::is_function(info)
                && std::ranges::find(names, meta::display_string_of(info)) != names.end();
        }));

#endif

    template for(constexpr meta::info FUNCTION: FUNCTIONS) {
        std::string funcName{meta::display_string_of(FUNCTION)};
        funcName.front() = std::tolower(funcName.front());
        // constexpr meta::info FUNC = FUNCTION;
        NODE_SET_METHOD(exports, funcName.c_str(), +[](const FunctionCallbackInfo<Value>& args) -> void { //
            constexpr auto FUNCTION_ARGS = std::define_static_array(meta::parameters_of(FUNCTION));
            if constexpr(FUNCTION_ARGS.empty()) {
                call_function<FUNCTION>(args);
            } else {
                call_function_with_args<FUNCTION>(args);
            }
        });
    }
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Initialize)
